function sanitizeAuditPayload(payload) {
  if (payload == null) {
    return null;
  }
  if (typeof payload === "object" && !Array.isArray(payload) && !Object.keys(payload).length) {
    return null;
  }
  if (Array.isArray(payload) && !payload.length) {
    return null;
  }
  return JSON.stringify(payload);
}

function parseAuditJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function buildAuditActor(user) {
  return {
    actorUserId: Number.isInteger(user?.id) ? user.id : null,
    actorName: String(user?.name || "System"),
    actorRole: String(user?.role || "system")
  };
}

function computeChangedFields(before, after, fields) {
  const changes = {};
  fields.forEach((field) => {
    const previousValue = before?.[field] ?? "";
    const nextValue = after?.[field] ?? "";
    if (previousValue !== nextValue) {
      changes[field] = {
        before: previousValue,
        after: nextValue
      };
    }
  });
  return changes;
}

function summarizeFieldLabels(changes, labels) {
  const fields = Object.keys(changes || {});
  if (!fields.length) {
    return "Keine fachlich relevanten Aenderungen.";
  }
  return fields.map((field) => labels[field] || field).join(", ");
}

function createAuditHelpers({ db }) {
  async function writeAuditLog({
    actor,
    actionType,
    entityType,
    entityId,
    targetUserId = null,
    summary = "",
    changes = null,
    metadata = null,
    trx = null
  }) {
    const actorSnapshot = buildAuditActor(actor);
    const runner = trx || db;
    await runner("audit_logs").insert({
      created_at: new Date(),
      actor_user_id: actorSnapshot.actorUserId,
      actor_name: actorSnapshot.actorName,
      actor_role: actorSnapshot.actorRole,
      action_type: String(actionType || "").trim(),
      entity_type: String(entityType || "").trim(),
      entity_id: String(entityId || ""),
      target_user_id: Number.isInteger(targetUserId) ? targetUserId : null,
      summary: String(summary || "").trim(),
      changes_json: sanitizeAuditPayload(changes),
      metadata_json: sanitizeAuditPayload(metadata)
    });
  }

  async function getUsersByIds(ids, trx = null) {
    const uniqueIds = [...new Set(ids.filter((value) => Number.isInteger(value)))];
    if (!uniqueIds.length) {
      return [];
    }

    const runner = trx || db;
    return runner("users")
      .select("id", "name", "username", "email", "role")
      .whereIn("id", uniqueIds);
  }

  async function logTrainerAssignmentChanges({ actor, traineeId, traineeName, beforeTrainerIds, afterTrainerIds, trx = null }) {
    const previous = [...new Set((beforeTrainerIds || []).filter((value) => Number.isInteger(value)))];
    const next = [...new Set((afterTrainerIds || []).filter((value) => Number.isInteger(value)))];
    const assignedIds = next.filter((trainerId) => !previous.includes(trainerId));
    const unassignedIds = previous.filter((trainerId) => !next.includes(trainerId));
    const trainers = await getUsersByIds([...assignedIds, ...unassignedIds], trx);
    const trainerMap = new Map(trainers.map((trainer) => [trainer.id, trainer]));

    for (const trainerId of assignedIds) {
      const trainer = trainerMap.get(trainerId);
      await writeAuditLog({
        actor,
        actionType: "TRAINER_ASSIGNED",
        entityType: "user",
        entityId: String(traineeId),
        targetUserId: traineeId,
        summary: `${trainer?.name || "Ausbilder"} wurde ${traineeName} zugeordnet.`,
        metadata: {
          traineeId,
          traineeName,
          trainerId,
          trainerName: trainer?.name || "",
          trainerUsername: trainer?.username || ""
        },
        trx
      });
    }

    for (const trainerId of unassignedIds) {
      const trainer = trainerMap.get(trainerId);
      await writeAuditLog({
        actor,
        actionType: "TRAINER_UNASSIGNED",
        entityType: "user",
        entityId: String(traineeId),
        targetUserId: traineeId,
        summary: `${trainer?.name || "Ausbilder"} wurde von ${traineeName} entfernt.`,
        metadata: {
          traineeId,
          traineeName,
          trainerId,
          trainerName: trainer?.name || "",
          trainerUsername: trainer?.username || ""
        },
        trx
      });
    }
  }

  async function listAuditLogs({ page = 1, pageSize = 20, actionType = "", userId = null, search = "", from = "", to = "" }) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPageSize = Math.min(100, Math.max(10, Number(pageSize) || 20));
    const baseQuery = db("audit_logs");

    if (actionType) {
      baseQuery.where({ action_type: actionType });
    }
    if (Number.isInteger(userId)) {
      baseQuery.andWhere((builder) => {
        builder.where({ actor_user_id: userId }).orWhere({ target_user_id: userId });
      });
    }
    if (search) {
      const like = `%${search}%`;
      baseQuery.andWhere((builder) => {
        builder
          .where("summary", "like", like)
          .orWhere("actor_name", "like", like)
          .orWhere("action_type", "like", like)
          .orWhere("entity_type", "like", like);
      });
    }
    if (from) {
      baseQuery.andWhere("created_at", ">=", from.length === 10 ? `${from}T00:00:00.000` : from);
    }
    if (to) {
      baseQuery.andWhere("created_at", "<=", to.length === 10 ? `${to}T23:59:59.999` : to);
    }

    const totalRow = await baseQuery.clone().count("* as count").first();
    const rows = await baseQuery.clone()
      .select(
        "id",
        "created_at",
        "actor_user_id",
        "actor_name",
        "actor_role",
        "action_type",
        "entity_type",
        "entity_id",
        "target_user_id",
        "summary",
        "changes_json",
        "metadata_json"
      )
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(normalizedPageSize)
      .offset((normalizedPage - 1) * normalizedPageSize);

    const total = Number(totalRow?.count || 0);

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        actionType: row.action_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        targetUserId: row.target_user_id,
        summary: row.summary,
        changes: parseAuditJson(row.changes_json),
        metadata: parseAuditJson(row.metadata_json)
      })),
      pagination: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / normalizedPageSize))
      }
    };
  }

  return {
    writeAuditLog,
    logTrainerAssignmentChanges,
    listAuditLogs
  };
}

module.exports = {
  computeChangedFields,
  summarizeFieldLabels,
  createAuditHelpers
};
