import { buildCvPdf } from '../../lib/cv-pdf';

export const GET = () => {
  const pdf = buildCvPdf('en');
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="CV-Mario-Leone-EN.pdf"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
