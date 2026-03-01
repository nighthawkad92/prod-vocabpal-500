import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest } from "../_shared/student.ts";

type RestoreAttemptRequest = {
  attemptId?: string;
  attemptIds?: string[];
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
  archived_at: string | null;
  students: AttemptStudentRow | null;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function assertRestoreResponseContract(payload: {
  restoredFromArchivesCount: number;
  restoredCount: number;
  restoredFromArchiveAttemptIds: string[];
  restoredAttemptIds: string[];
}): void {
  if (!Number.isFinite(payload.restoredFromArchivesCount)) {
    throw new Error("Restore response contract violated: restoredFromArchivesCount must be numeric");
  }
  if (!Number.isFinite(payload.restoredCount)) {
    throw new Error("Restore response contract violated: restoredCount must be numeric");
  }
  if (!isStringArray(payload.restoredFromArchiveAttemptIds)) {
    throw new Error("Restore response contract violated: restoredFromArchiveAttemptIds must be string[]");
  }
  if (!isStringArray(payload.restoredAttemptIds)) {
    throw new Error("Restore response contract violated: restoredAttemptIds must be string[]");
  }
}

function normalizeAttemptIds(body: RestoreAttemptRequest): string[] {
  const rawIds: Array<string> = [];

  if (typeof body.attemptId === "string") {
    rawIds.push(body.attemptId);
  }

  if (Array.isArray(body.attemptIds)) {
    for (const value of body.attemptIds) {
      if (typeof value === "string") {
        rawIds.push(value);
      }
    }
  }

  return Array.from(new Set(rawIds.map((id) => id.trim()).filter(Boolean)));
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as RestoreAttemptRequest;
    const attemptIds = normalizeAttemptIds(body);
    if (attemptIds.length === 0) {
      return json(req, 400, { error: "attemptId or attemptIds[] is required" });
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
        archived_at,
        students!inner(
          id,
          first_name,
          last_name,
          classes(
            name
          )
        )
      `)
      .in("id", attemptIds);

    if (attemptResult.error) {
      throw new Error(`Failed to load attempt for restore: ${attemptResult.error.message}`);
    }

    const attempts = (attemptResult.data ?? []) as AttemptRow[];
    const foundIds = new Set(attempts.map((attempt) => attempt.id));
    if (foundIds.size !== attemptIds.length) {
      const missingAttemptIds = attemptIds.filter((id) => !foundIds.has(id));
      return json(req, 404, {
        error: "One or more attempts were not found",
        missingAttemptIds,
      });
    }

    if (attempts.some((attempt) => attempt.test_id !== baselineTest.id)) {
      return json(req, 400, { error: "Only baseline attempts can be restored from Archives" });
    }

    const alreadyActiveAttemptIds = attempts
      .filter((attempt) => attempt.archived_at === null)
      .map((attempt) => attempt.id);
    const candidateIds = attempts
      .filter((attempt) => attempt.archived_at !== null)
      .map((attempt) => attempt.id);

    let restoredCount = 0;
    if (candidateIds.length > 0) {
      const restoreResult = await client
        .from("attempts")
        .update({ archived_at: null })
        .in("id", candidateIds)
        .not("archived_at", "is", null);

      if (restoreResult.error) {
        throw new Error(`Failed to restore attempt from Archives: ${restoreResult.error.message}`);
      }

      restoredCount = candidateIds.length;
    }

    const studentMap = new Map<string, {
      id: string;
      firstName: string;
      lastName: string;
      className: string | null;
    }>();

    for (const attempt of attempts) {
      const student = attempt.students;
      if (!student?.id) continue;
      studentMap.set(student.id, {
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        className: student.classes?.name ?? null,
      });
    }

    const students = Array.from(studentMap.values());

    await logTeacherEvent(client, teacherSession.teacher_name, "attempt_restored", {
      attemptIds,
      restoredCount,
      studentCount: students.length,
      previousStatuses: attempts.map((attempt) => ({
        attemptId: attempt.id,
        status: attempt.status,
      })),
      alreadyActiveCount: alreadyActiveAttemptIds.length,
      alreadyActiveAttemptIds,
    });

    const responsePayload = {
      restoredFromArchives: true,
      restoredFromArchivesCount: restoredCount,
      restoredFromArchiveAttemptIds: candidateIds,
      restored: true,
      restoredCount,
      restoredAttemptIds: candidateIds,
      alreadyActiveCount: alreadyActiveAttemptIds.length,
      alreadyActiveAttemptIds,
      students,
      student: students[0] ?? null,
    };

    assertRestoreResponseContract(responsePayload);
    return json(req, 200, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
