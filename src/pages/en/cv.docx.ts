import { buildCvDocx } from '../../lib/cv-docx';

export const GET = async () => {
  const docx = await buildCvDocx('en');
  return new Response(docx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="CV-Mario-Leone-EN.docx"',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
