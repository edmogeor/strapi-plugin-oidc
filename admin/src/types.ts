import type { ComponentType } from 'react';

export interface SettingsLink {
  id: string;
  to: string;
  intlLabel: { id: string; defaultMessage: string };
  Component:
    | ComponentType<Record<string, unknown>>
    | (() => Promise<{ default: ComponentType<Record<string, unknown>> }>);
  permissions?: { action: string; subject: string | null }[];
}

export interface StrapiAdminApp {
  addSettingsLink: (
    id: { id: string; intlLabel: { id: string; defaultMessage: string } },
    link: SettingsLink,
  ) => void;
  registerPlugin: (plugin: unknown) => void;
}

// fallow-ignore-next-line unused-types
export interface RegisterTradsParams {
  locales: string[];
}
