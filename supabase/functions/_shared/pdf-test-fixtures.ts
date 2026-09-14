// Synthetic fixtures only: no student's document belongs in the test suite.
export function validResumePdfBytes(extraCatalog = '', extraObjects: string[] = []): Uint8Array {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${extraCatalog} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 56 >>\nstream\nBT /F1 12 Tf 72 720 Td (Synthetic resume fixture) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...extraObjects,
  ];
  let content = '%PDF-1.7\n% Synthetic resume\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(content.length);
    content += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  // A valid comment pads the synthetic document to the existing 10 KB minimum.
  content += `%${' '.repeat(Math.max(0, 10 * 1024 - content.length))}\n`;
  const xref = content.length;
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) content += `${String(offset).padStart(10, '0')} 00000 n \n`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}
