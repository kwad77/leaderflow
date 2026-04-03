import type { BaseIntegration } from './types';

type IntegrationConstructor = new () => BaseIntegration;

class IntegrationRegistry {
  private map = new Map<string, IntegrationConstructor>();

  register(type: string, cls: IntegrationConstructor): void {
    this.map.set(type, cls);
  }

  create(type: string): BaseIntegration {
    const Cls = this.map.get(type);
    if (!Cls) {
      throw new Error(
        `Unknown integration type: ${type}. Registered: ${[...this.map.keys()].join(', ')}`
      );
    }
    return new Cls();
  }

  isRegistered(type: string): boolean {
    return this.map.has(type);
  }

  registeredTypes(): string[] {
    return [...this.map.keys()];
  }
}

export const integrationRegistry = new IntegrationRegistry();
