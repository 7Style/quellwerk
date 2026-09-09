/**
 * BREVO Template ID Mapping
 * Maps local template names to BREVO template IDs
 */

import { emailConfig } from '../../email.config.js';

/**
 * Get BREVO template ID for a given template name
 */
export function getTemplateId(templateName: string): number | undefined {
  return emailConfig.brevo.templates[templateName as keyof typeof emailConfig.brevo.templates];
}
