export type EditarraPublicationStatus = 'bloqueado' | 'revision' | 'listo_para_publicar';
export type EditarraPublicationMode = 'manual' | 'asistido' | 'automatico';
export type EditarraCmsType = 'umsa_blog' | 'wordpress' | 'headless_json';
export type EditarraPublicationTargetStatus = 'bloqueado' | 'preview_listo';

export type PublicationDestination = {
  id: string;
  name: string;
  cmsType: EditarraCmsType;
  baseUrl: string;
  endpoint: string;
  postingMode: EditarraPublicationMode;
  stylePreset: 'umsa-blog' | 'generic';
  categoryMap: Record<string, string>;
  enabled: boolean;
  requiredFields: string[];
};

export type EditarraPublicationTarget = {
  destinationId: string;
  destinationName: string;
  cmsType: EditarraCmsType;
  status: EditarraPublicationTargetStatus;
  payload: Record<string, unknown>;
  missingFields: string[];
  previewUrlLocal: string;
  externalPostEnabled: false;
};

export type EditarraPublicationManifest = {
  id: string;
  product: 'editarra';
  status: EditarraPublicationStatus;
  mode: EditarraPublicationMode;
  payloadFile: 'publication_payload.json';
  packageFile: 'package_manifest.json';
  distributionFile: 'distribution_plan.json';
  endpoint: string;
  externalPostEnabled: false;
  nextAction: string;
  blockers: number;
  warnings: number;
  channels: Array<{
    channel: string;
    label: string;
    items: number;
  }>;
  activePayload: {
    title: string;
    category: string;
    publishAt: string;
    slug: string;
  };
  controls: Array<{
    id: string;
    label: string;
    enabled: boolean;
    reason: string;
  }>;
  destinations: Array<{
    id: string;
    name: string;
    cmsType: EditarraCmsType;
    status: EditarraPublicationTargetStatus;
    previewUrlLocal: string;
  }>;
};

type BuildPublicationManifestInput = {
  packageId: string;
  slug?: string;
  ready: boolean;
  blockers: number;
  warnings: number;
  postingMode: EditarraPublicationMode;
  endpoint: string;
  publicationPayload: Record<string, unknown>;
  distributionManifest: {
    distribution_id?: string;
    channels?: Array<{
      channel?: string;
      label?: string;
      items?: number;
    }>;
  };
  destinations?: PublicationDestination[];
  publicationTargets?: EditarraPublicationTarget[];
};

const stringValue = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
);

export const defaultPublicationDestinations: PublicationDestination[] = [
  {
    id: 'umsa-blog',
    name: 'UMSA Blog',
    cmsType: 'umsa_blog',
    baseUrl: 'https://www.ultimamilla.com.ar/blog',
    endpoint: 'https://www.ultimamilla.com.ar/api/blog',
    postingMode: 'asistido',
    stylePreset: 'umsa-blog',
    categoryMap: {
      noticias: 'noticias',
      tecnico: 'tecnico',
      proyectos: 'proyectos',
      empresa: 'empresa',
    },
    enabled: true,
    requiredFields: ['titulo', 'resumen', 'contenido', 'categoria', 'slug', 'meta_title', 'meta_description'],
  },
  {
    id: 'licitometro-json',
    name: 'Licitometro JSON',
    cmsType: 'headless_json',
    baseUrl: 'https://www.licitometro.ar/editarra',
    endpoint: 'manual-export://licitometro-json',
    postingMode: 'manual',
    stylePreset: 'generic',
    categoryMap: {
      noticias: 'noticias',
      tecnico: 'tecnico',
      proyectos: 'proyectos',
      empresa: 'empresa',
    },
    enabled: true,
    requiredFields: ['titulo', 'resumen', 'contenido', 'categoria', 'slug', 'meta_title', 'meta_description'],
  },
];

const isPresentPayloadValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined;
};

export const buildPublicationTargets = ({
  packageId,
  slug,
  ready,
  blockers,
  publicationPayload,
  destinations = defaultPublicationDestinations,
}: {
  packageId: string;
  slug: string;
  ready: boolean;
  blockers: number;
  publicationPayload: Record<string, unknown>;
  destinations?: PublicationDestination[];
}): EditarraPublicationTarget[] => destinations.map((destination) => {
  const missingFields = destination.requiredFields.filter((field) => !isPresentPayloadValue(publicationPayload[field]));
  const status: EditarraPublicationTargetStatus = destination.enabled && missingFields.length === 0
    ? 'preview_listo'
    : 'bloqueado';
  const category = stringValue(publicationPayload.categoria || publicationPayload.category, 'tecnico');
  const mappedCategory = destination.categoryMap[category] || category;

  return {
    destinationId: destination.id,
    destinationName: destination.name,
    cmsType: destination.cmsType,
    status,
    payload: {
      ...publicationPayload,
      categoria: mappedCategory,
      destination: {
        id: destination.id,
        name: destination.name,
        cms_type: destination.cmsType,
        endpoint: destination.endpoint,
        posting_mode: destination.postingMode,
        external_post_enabled: false,
      },
      editarra_package_id: packageId,
    },
    missingFields,
    previewUrlLocal: `/editarra/preview/${destination.id}/${slug}`,
    externalPostEnabled: false,
  };
});

export const buildEditarraPublicationManifest = ({
  packageId,
  slug: explicitSlug,
  ready,
  blockers,
  warnings,
  postingMode,
  endpoint,
  publicationPayload,
  distributionManifest,
  destinations = defaultPublicationDestinations,
  publicationTargets,
}: BuildPublicationManifestInput): EditarraPublicationManifest => {
  const status: EditarraPublicationStatus = blockers > 0
    ? 'bloqueado'
    : ready
      ? 'listo_para_publicar'
      : 'revision';
  const channels = (distributionManifest.channels || []).map((channel) => ({
    channel: stringValue(channel.channel, 'site'),
    label: stringValue(channel.label, stringValue(channel.channel, 'Sitio')),
    items: Number.isFinite(Number(channel.items)) ? Number(channel.items) : 0,
  }));
  const title = stringValue(publicationPayload.titulo || publicationPayload.title, 'Payload sin titulo');
  const category = stringValue(publicationPayload.categoria || publicationPayload.category, 'tecnico');
  const publishAt = stringValue(publicationPayload.fecha_publicacion || publicationPayload.publish_at, 'sin fecha');
  const slug = stringValue(explicitSlug || publicationPayload.slug, 'slug-pendiente');
  const distributionId = stringValue(distributionManifest.distribution_id, 'distribution_plan');
  const canPreparePayload = status !== 'bloqueado';
  const canPublishManually = status === 'listo_para_publicar';
  const canUseExternalEndpoint = false;
  const targets = publicationTargets || buildPublicationTargets({
    packageId,
    slug,
    ready,
    blockers,
    publicationPayload,
    destinations,
  });

  return {
    id: `publication-${packageId}`,
    product: 'editarra',
    status,
    mode: postingMode,
    payloadFile: 'publication_payload.json',
    packageFile: 'package_manifest.json',
    distributionFile: 'distribution_plan.json',
    endpoint,
    externalPostEnabled: false,
    nextAction: status === 'bloqueado'
      ? `${blockers} bloqueos activos; resolver preflight antes de preparar publicacion.`
      : status === 'revision'
        ? `${warnings} avisos activos; preparar paquete y pedir revision humana.`
        : postingMode === 'manual'
          ? 'Copiar publication_payload.json y programar publicacion manual.'
          : 'Preparar publication_payload.json, confirmar revision humana y operar canal asistido sin POST externo.',
    blockers,
    warnings,
    channels,
    activePayload: {
      title,
      category,
      publishAt,
      slug,
    },
    controls: [
      {
        id: 'prepare_payload',
        label: 'Preparar payload',
        enabled: canPreparePayload,
        reason: canPreparePayload ? 'publication_payload.json disponible para revisión.' : 'Hay bloqueos editoriales activos.',
      },
      {
        id: 'export_package',
        label: 'Exportar paquete',
        enabled: canPreparePayload,
        reason: canPreparePayload ? 'package_manifest.json y archivos del paquete pueden descargarse.' : 'Resolver bloqueos antes de exportar.',
      },
      {
        id: 'generate_distribution',
        label: 'Generar distribución',
        enabled: channels.length > 0 && canPreparePayload,
        reason: channels.length > 0 ? `${distributionId} tiene ${channels.length} canales.` : 'No hay canales configurados.',
      },
      {
        id: 'manual_publish',
        label: 'Publicar manualmente',
        enabled: canPublishManually,
        reason: canPublishManually ? 'Payload listo para copiar al CMS o workflow externo.' : 'Requiere estado listo_para_publicar.',
      },
      {
        id: 'external_post',
        label: 'POST externo',
        enabled: canUseExternalEndpoint,
        reason: 'Deshabilitado por guardrail local; no se llama producción desde EDITARRA.',
      },
    ],
    destinations: targets.map((target) => ({
      id: target.destinationId,
      name: target.destinationName,
      cmsType: target.cmsType,
      status: target.status,
      previewUrlLocal: target.previewUrlLocal,
    })),
  };
};
