import v1 from './v1';

export interface SwaggerVersion {
  spec: object;
  label: string;
  description: string;
}

export const versions: Record<string, SwaggerVersion> = {
  v1: {
    spec: v1,
    label: 'V1',
    description: "Version stable de l'API ThermalSense.",
  },
};

export const latestVersion = Object.keys(versions).at(-1) as string;
