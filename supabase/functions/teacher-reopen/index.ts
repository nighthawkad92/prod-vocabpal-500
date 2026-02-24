import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest, normalizeClassName, normalizeNameKey } from "../_shared/student.ts";

type ReopenRequest = {
  firstName?: string;
  lastName?: string;
  className?: string;
  reason?: string;
};

type ClassRow = {
  id: string;
};

type StudentRow = {
  id: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);

    const body = (await req.json()) as ReopenRequest;
    const firstName = normalizeNameKey(body.firstName ?? "");
    const lastName = normalizeNameKey(body.lastName ?? "");
    const classNameNorm = normalizeClassName(body.className ?? "").toLowerCase();
    const reason = (body.reason ?? "").trim();

    if (!firstName || !lastName || !classNameNorm || !reason) {
      return json(req, 400, {
        error: "firstName, lastName, className and reason are required",
      });
    }

    const classResult = await client
      .from("classes")
      .select("id")
      .eq("name_norm", classNameNorm)
      .maybeSingle<ClassRow>();
    if (classResult.error) {
      throw new Error(`Failed to load class: ${classResult.error.message}`);
    }
    if (!classResult.data) {
      return json(req, 404, { error: "Class not found" });
    }

    const studentResult = await client
      .from("students")
      .select("id")
      .eq("class_id", classResult.data.id)
      .eq("first_name_norm", firstName)
      .eq("last_name_norm", lastName)
      .maybeSingle<StudentRow>();
    if (studentResult.error) {
      throw new Error(`Failed to load student: ${studentResult.error.message}`);
    }
    if (!studentResult.data) {
      return json(req, 404, { error: "Student not found in this class" });
    }

    const baselineTest = await getBaselineTest(client);

    const attemptsCountResult = await client
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentResult.data.id)
      .eq("test_id", baselineTest.id);
    if (attemptsCountResult.error) {
      throw new Error(`Failed to count student attempts: ${attemptsCountResult.error.message}`);
    }

    const attemptsUsed = attemptsCountResult.count ?? 0;
    if (attemptsUsed === 0) {
      return json(req, 409, {
        error: "Student has no baseline attempt yet, reopen is not needed",
      });
    }

    const reopenInsert = await client.from("teacher_reopens").insert({
      student_id: studentResult.data.id,
      test_id: baselineTest.id,
      reopened_by_teacher_name: teacherSession.teacher_name,
      reason,
    });
    if (reopenInsert.error) {
      throw new Error(`Failed to grant reopen: ${reopenInsert.error.message}`);
    }

    const reopensCountResult = await client
      .from("teacher_reopens")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentResult.data.id)
      .eq("test_id", baselineTest.id);
    if (reopensCountResult.error) {
      throw new Error(`Failed to count reopens: ${reopensCountResult.error.message}`);
    }

    const totalReopens = reopensCountResult.count ?? 0;
    const maxAllowedAttempts = 1 + totalReopens;
    const remainingAttempts = Math.max(maxAllowedAttempts - attemptsUsed, 0);

    await logTeacherEvent(client, teacherSession.teacher_name, "student_reopened", {
      studentId: studentResult.data.id,
      classNameNorm,
      attemptsUsed,
      totalReopens,
      reason,
    });

    return json(req, 200, {
      reopened: true,
      studentId: studentResult.data.id,
      attemptsUsed,
      totalReopens,
      maxAllowedAttempts,
      remainingAttempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
