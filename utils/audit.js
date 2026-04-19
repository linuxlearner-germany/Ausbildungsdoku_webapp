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
  function writeAuditLog({ actor, actionType, entityType, entityId, targetUserId = null, summary = "", changes = null, metadata = null }) {
    const actorSnapshot = buildAuditActor(actor);
    db.prepare(`
      INSERT INTO audit_logs (
        created_at, actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id,
        target_user_id, summary, changes_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      actorSnapshot.actorUserId,
      actorSnapshot.actorName,
      actorSnapshot.actorRole,
      String(actionType || "").trim(),
      String(entityType || "").trim(),
      String(entityId || ""),
      Number.isInteger(targetUserId) ? targetUserId : null,
      String(summary || "").trim(),
      sanitizeAuditPayload(changes),
      sanitizeAuditPayload(metadata)
    );
  }

  function getUsersByIds(ids) {
    const uniqueIds = [...new Set(ids.filter((value) => Number.isInteger(value)))];
    if (!uniqueIds.length) {
      return [];
    }

    return db.prepare(`
      SELECT id, name, username, email, role
      FROM users
      WHERE id IN (${uniqueIds.map(() => "?").join(", ")})
    `).all(...uniqueIds);
  }

  function logTrainerAssignmentChanges({ actor, traineeId, traineeName, beforeTrainerIds, afterTrainerIds }) {
    const previous = [...new Set((beforeTrainerIds || []).filter((value) => Number.isInteger(value)))];
    const next = [...new Set((afterTrainerIds || []).filter((value) => Number.isInteger(value)))];
    const assignedIds = next.filter((trainerId) => !previous.includes(trainerId));
    const unassignedIds = previous.filter((trainerId) => !next.includes(trainerId));
    const trainers = getUsersByIds([...assignedIds, ...unassignedIds]);
    const trainerMap = new Map(trainers.map((trainer) => [trainer.id, trainer]));

    assignedIds.forEach((trainerId) => {
      const trainer = trainerMap.get(trainerId);
      writeAuditLog({
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
        }
      });
    });

    unassignedIds.forEach((trainerId) => {
      const trainer = trainerMap.get(trainerId);
      writeAuditLog({
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
        }
      });
    });
  }

  function listAuditLogs({ page = 1, pageSize = 20, actionType = "", userId = null, search = "", from = "", to = "" }) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPageSize = Math.min(100, Math.max(10, Number(pageSize) || 20));
    const params = [];
    const conditions = [];

    if (actionType) {
      conditions.push("action_type = ?");
      params.push(actionType);
    }
    if (Number.isInteger(userId)) {
      conditions.push("(actor_user_id = ? OR target_user_id = ?)");
      params.push(userId, userId);
    }
    if (search) {
      conditions.push("(summary LIKE ? OR actor_name LIKE ? OR action_type LIKE ? OR entity_type LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (from) {
      conditions.push("datetime(created_at) >= datetime(?)");
      params.push(from.length === 10 ? `${from} 00:00:00` : from);
    }
    if (to) {
      conditions.push("datetime(created_at) <= datetime(?)");
      params.push(to.length === 10 ? `${to} 23:59:59` : to);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${whereClause}`).get(...params).count;
    const rows = db.prepare(`
      SELECT id, created_at, actor_user_id, actor_name, actor_role, action_type, entity_type,
             entity_id, target_user_id, summary, changes_json, metadata_json
      FROM audit_logs
      ${whereClause}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize);

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
