type LeadType = 'contact' | 'pre_call' | 'booking' | 'audit';

export async function trackSuccessfulLead(response: Response, leadType: LeadType): Promise<void> {
  try {
    if (!response.ok || localStorage.getItem('ga4ConsentV1') !== 'granted') return;
    const result = await response.clone().json();
    if (result?.success !== true || localStorage.getItem('ga4ConsentV1') !== 'granted') return;
    const analytics = window as Window & { gtag?: (...args: unknown[]) => void };
    analytics.gtag?.('event', 'generate_lead', { lead_type: leadType });
  } catch {
    // Analytics must never affect the form submission.
  }
}
