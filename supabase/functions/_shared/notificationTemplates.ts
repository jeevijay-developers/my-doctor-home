// Reusable, channel-specific message templates for checkup reminders.
// {{patient_name}} / {{doctor_name}} / {{checkup_date}} are the only
// variables the spec calls for — kept as a flat string-to-string map so
// adding a new template later doesn't require touching the render function.
export type TemplateVars = { patient_name: string; doctor_name: string; checkup_date: string };

export const WHATSAPP_CHECKUP_TEMPLATE =
  "Hello {{patient_name}}, your regular checkup with Dr. {{doctor_name}} is due on {{checkup_date}}. Please book your appointment.";

export const SMS_CHECKUP_TEMPLATE =
  "Hi {{patient_name}}, your regular checkup with Dr. {{doctor_name}} is due on {{checkup_date}}. Please book your appointment.";

export const IN_APP_CHECKUP_TEMPLATE =
  "Your regular checkup is due on {{checkup_date}}.";

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replaceAll("{{patient_name}}", vars.patient_name)
    .replaceAll("{{doctor_name}}", vars.doctor_name)
    .replaceAll("{{checkup_date}}", vars.checkup_date);
}
