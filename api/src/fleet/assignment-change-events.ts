import { EventEmitter } from 'node:events';
import type { AssignmentChangedEventPayload } from '@ship/shared';
import { invokeAssignmentChangedAgent } from './services/invoke-agent.js';

const assignmentEvents = new EventEmitter();
let initialized = false;

export function initializeAssignmentChangeAgent(): void {
  if (initialized) return;
  initialized = true;

  assignmentEvents.on('assignment_changed', (payload: AssignmentChangedEventPayload) => {
    void invokeAssignmentChangedAgent(payload).catch((err) => {
      console.error('FleetGraph assignment_changed run failed:', err);
    });
  });
}

export function publishAssignmentChanged(payload: AssignmentChangedEventPayload): void {
  assignmentEvents.emit('assignment_changed', payload);
}
