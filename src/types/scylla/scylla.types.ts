export type ConnectionParams = {
  contactPoints: string[];
  port: number;
  localDc: string;
  username: string;
  password: string;
};

export type SavedConnection = ConnectionParams & { id: number; name: string };

export type JsonRow = Record<string, unknown>;

export type ClusterInfo = { releaseVersion?: string; clusterName?: string };

export type NewConnectionForm = {
  name: string;
  pointsStr: string;
  port: number;
  localDc: string;
  username: string;
  password: string;
};
