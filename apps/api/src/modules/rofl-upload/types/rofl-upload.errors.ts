/**
 * Expected rejection of an upload caused by its content (file type, size limits, unregistered
 * players, roster violations...). Its message is safe to send to the client as is. Any other
 * error reaching the gateway is treated as unexpected and is only reported through an incidentId.
 */
export class RoflUploadDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoflUploadDomainError';
  }
}
