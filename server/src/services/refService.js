import { config } from '../config.js';
import { currentYearIst } from '../utils/dates.js';

// Must be called inside a transaction (withTransaction). Allocates the reference
// number once per (cycle, program, semester, exam_type) and freezes issue date on
// first generation; every later PDF request returns the same stored row.
export async function getOrCreateRef(conn, { cycleId, programId, semester, examType }) {
  const [existing] = await conn.execute(
    `SELECT ref_no, issued_on FROM datesheet_refs
     WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem AND exam_type = :type
     FOR UPDATE`,
    { cycle: cycleId, prog: programId, sem: semester, type: examType },
  );
  if (existing.length) {
    return { refNo: existing[0].ref_no, issuedOn: existing[0].issued_on };
  }

  const year = currentYearIst();
  const [maxRows] = await conn.execute(
    `SELECT COALESCE(MAX(ref_seq), 0) AS maxSeq FROM datesheet_refs WHERE ref_year = :year FOR UPDATE`,
    { year },
  );
  const seq = Math.max(Number(maxRows[0].maxSeq) + 1, config.refSeqStart);
  const refNo = `CUJ/Exam/Datesheet/${year}/${seq}`;

  try {
    await conn.execute(
      `INSERT INTO datesheet_refs (exam_cycle_id, program_id, semester, exam_type, ref_year, ref_seq, ref_no, issued_on)
       VALUES (:cycle, :prog, :sem, :type, :year, :seq, :refNo, CURDATE())`,
      { cycle: cycleId, prog: programId, sem: semester, type: examType, year, seq, refNo },
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [retry] = await conn.execute(
        `SELECT ref_no, issued_on FROM datesheet_refs
         WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem AND exam_type = :type
         FOR UPDATE`,
        { cycle: cycleId, prog: programId, sem: semester, type: examType },
      );
      if (retry.length) return { refNo: retry[0].ref_no, issuedOn: retry[0].issued_on };
    }
    throw err;
  }

  const [issuedRow] = await conn.execute(
    `SELECT issued_on FROM datesheet_refs WHERE ref_no = :refNo LIMIT 1`,
    { refNo },
  );
  return { refNo, issuedOn: issuedRow[0].issued_on };
}
