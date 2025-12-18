/**
 * POST /api/content-types/import
 * Import content type + fields (idempotent-ish)
 *
 * Behavior:
 * - If slug does NOT exist: creates content type + inserts fields
 * - If slug DOES exist: updates content type + REPLACES fields (delete + insert)
 *
 * Optional:
 * - dryRun: true (validates and returns what would happen, without writing)
 */
router.post("/import", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { contentType, fields, dryRun = false } = req.body || {};

    if (!contentType || !Array.isArray(fields)) {
      return res.status(400).json({ error: "contentType and fields are required" });
    }

    // Safety guard: prevent accidental massive imports
    const MAX_FIELDS = 500;
    if (fields.length > MAX_FIELDS) {
      return res.status(400).json({
        error: `Too many fields (${fields.length}). Max allowed is ${MAX_FIELDS}.`
      });
    }

    // Map your import JSON -> your DB schema
    const slug = String(contentType.slug || contentType.key || "").trim();
    const labelSingular = String(
      contentType.singular || contentType.label_singular || ""
    ).trim();
    const labelPlural = String(
      contentType.plural || contentType.label_plural || ""
    ).trim();

    if (!slug || !labelSingular || !labelPlural) {
      return res.status(400).json({
        error:
          "contentType.slug (or key), contentType.singular, and contentType.plural are required"
      });
    }

    // Normalize incoming fields to your DB shape
    // (also provides a little safety: skip blank keys)
    const normalizedFields = fields
      .map((f, index) => {
        const fieldKey = String(f?.key || f?.field_key || "").trim();
        if (!fieldKey) return null;

        const config = {
          optionsSource: f?.optionsSource ?? null,
          options: f?.options ?? null,
          relation: f?.relation ?? null
        };

        return {
          content_type_id: null, // set after type known
          field_key: fieldKey,
          label: String(f?.label || fieldKey).trim(),
          type: String(f?.type || "text").trim(),
          required: !!f?.required,
          help_text: String(f?.help_text || "").trim(),
          order_index:
            typeof f?.order_index === "number" ? f.order_index : index,
          config
        };
      })
      .filter(Boolean);

    if (!normalizedFields.length) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    // If dryRun, don't touch DB — just report what would happen
    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        slug,
        willCreateOrUpdate: true,
        fieldsProvided: fields.length,
        fieldsNormalized: normalizedFields.length
      });
    }

    await client.query("BEGIN");

    // Check if content type already exists by slug
    const existing = await client.query(
      `SELECT id FROM content_types WHERE slug = $1`,
      [slug]
    );

    let contentTypeRow;

    if (existing.rows.length) {
      // UPDATE existing content type
      const updateSql = `
        UPDATE content_types
        SET
          type = COALESCE($2, type),
          label_singular = COALESCE($3, label_singular),
          label_plural = COALESCE($4, label_plural),
          description = COALESCE($5, description),
          icon = COALESCE($6, icon),
          is_system = COALESCE($7, is_system),
          name = COALESCE($8, name),
          updated_at = NOW()
        WHERE slug = $1
        RETURNING *;
      `;

      const updated = await client.query(updateSql, [
        slug,
        contentType.type || "content",
        labelSingular,
        labelPlural,
        contentType.description || "",
        contentType.icon ?? null,
        typeof contentType.is_system === "boolean" ? contentType.is_system : false,
        labelPlural // legacy "name"
      ]);

      contentTypeRow = updated.rows[0];

      // Replace fields (idempotent-ish): delete then insert
      await client.query(
        `DELETE FROM content_fields WHERE content_type_id = $1`,
        [contentTypeRow.id]
      );
    } else {
      // INSERT new content type
      const insertTypeSql = `
        INSERT INTO content_types
          (slug, type, label_singular, label_plural, description, icon, is_system, name)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;

      const inserted = await client.query(insertTypeSql, [
        slug,
        contentType.type || "content",
        labelSingular,
        labelPlural,
        contentType.description || "",
        contentType.icon ?? null,
        !!contentType.is_system,
        labelPlural // legacy "name"
      ]);

      contentTypeRow = inserted.rows[0];
    }

    // Insert fields into content_fields
    const insertFieldSql = `
      INSERT INTO content_fields
        (content_type_id, field_key, label, type, required, help_text, order_index, config)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *;
    `;

    const insertedFields = [];
    for (const f of normalizedFields) {
      const fieldRes = await client.query(insertFieldSql, [
        contentTypeRow.id,
        f.field_key,
        f.label,
        f.type || "text",
        f.required,
        f.help_text || "",
        f.order_index,
        JSON.stringify(f.config || {})
      ]);
      insertedFields.push(fieldRes.rows[0]);
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      contentType: contentTypeRow,
      fieldsImported: insertedFields.length,
      replacedExisting: existing.rows.length > 0
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("IMPORT FAILED:", err);

    return res.status(500).json({
      error: "Import failed",
      message: err.message
    });
  } finally {
    client.release();
  }
});
