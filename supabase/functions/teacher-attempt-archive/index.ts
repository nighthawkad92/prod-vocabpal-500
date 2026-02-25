import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest } from "../_shared/student.ts";

type ArchiveAttemptRequest = {
  attemptId?: string;
};

type AttemptStudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  classes: {
    name: string;
  } | null;
};

type AttemptRow = {
  id: string;
  student_id: string;
  test_id: string;
  status: string;
  students: AttemptStudentRow | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as ArchiveAttemptRequest;
    const attemptId = (body.attemptId ?? "").trim();
    if (!attemptId) {
      return json(req, 400, { error: "attemptId is required" });
    }

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);
    const baselineTest = await getBaselineTest(client);

    const attemptResult = await client
      .from("attempts")
      .select(`
        id,
        student_id,
        test_id,
        status,
        students!inner(
          id,
          first_name,
          last_name,
          classes(
            name
          )
        )
      `)
      .eq("id", attemptId)
      .maybeSingle<AttemptRow>();

    if (attemptResult.error) {
      throw new Error(`Failed to load attempt for archiving: ${attemptResult.error.message}`);
    }
    if (!attemptResult.data) {
      return json(req, 404, { error: "Attempt not found" });
    }
    if (attemptResult.data.test_id !== baselineTest.id) {
      return json(req, 400, { error: "Only baseline attempts can be archived" });
    }

    const deleteResult = await client
      .from("attempts")
      .delete()
      .eq("id", attemptId);

    if (deleteResult.error) {
      throw new Error(`Failed to archive attempt: ${deleteResult.error.message}`);
    }

    await logTeacherEvent(client, teacherSession.teacher_name, "attempt_archived", {
      attemptId,
      studentId: attemptResult.data.student_id,
      className: attemptResult.data.students?.classes?.name ?? null,
      previousStatus: attemptResult.data.status,
      reopenMode: "archive_unlocked",
    });

    return json(req, 200, {
      archived: true,
      reopened: true,
      student: {
        id: attemptResult.data.students?.id ?? null,
        firstName: attemptResult.data.students?.first_name ?? null,
        lastName: attemptResult.data.students?.last_name ?? null,
        className: attemptResult.data.students?.classes?.name ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
