import type { CapabilityDescriptor, CapabilityRegistry } from '@athena-os/core';
import type { ReasoningBackendResult } from '@athena-os/reasoning';
import type { ConformanceScenario } from '../scenario.js';

/**
 * Canonical behavioral fixtures — authored oracles of what conforming
 * reasoning looks like when no deterministic baseline exists (RFC-0012
 * §Behavioral Conformance). These are the contract a future LLM backend
 * must satisfy; the oracle is the fixture, not another backend.
 */

function capability(id: string, description: string, goalKinds: string[]): CapabilityDescriptor {
  return { id, description, goalKinds, availability: 'available', requiresResources: [] };
}

const flightSearchRegistry: CapabilityRegistry = {
  capabilities: () => [
    capability('flights-search', 'Search flight itineraries', ['searchFlights']),
  ],
};

const tripPlanRegistry: CapabilityRegistry = {
  capabilities: () => [
    capability('flights-search', 'Search flight itineraries', ['searchFlights']),
    capability('hotels-search', 'Find hotel options', ['bookHotel']),
  ],
};

export const flightSearchScenario: ConformanceScenario = {
  id: 'flight-search',
  layer: 'behavioral',
  intent: {
    id: 'intent-flight-search',
    text: 'find me flights to Tokyo under $500',
    goals: [],
    constraints: [],
  },
  registry: flightSearchRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-flight-search',
      intentId: 'intent-flight-search',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'flights-search',
          action: 'execute',
          description: "Satisfy 'searchFlights' with 'flights-search'",
          dependsOn: [],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const weekendTripScenario: ConformanceScenario = {
  id: 'weekend-trip',
  layer: 'behavioral',
  intent: {
    id: 'intent-weekend-trip',
    text: 'plan a weekend trip to Kyoto',
    goals: [],
    constraints: [],
  },
  registry: tripPlanRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-weekend-trip',
      intentId: 'intent-weekend-trip',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'flights-search',
          action: 'execute',
          description: "Satisfy 'searchFlights' with 'flights-search'",
          dependsOn: [],
        },
        {
          id: 'step-2',
          goalId: 'goal-2',
          capabilityId: 'hotels-search',
          action: 'execute',
          description: "Satisfy 'bookHotel' with 'hotels-search'",
          dependsOn: ['step-1'],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const behavioralScenarios: readonly ConformanceScenario[] = [
  flightSearchScenario,
  weekendTripScenario,
];
