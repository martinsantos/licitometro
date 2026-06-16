export type EditarraRecipeKey = 'reactiva' | 'evergreen' | 'caso' | 'empresa';
export type PipelineStageStatus = 'listo' | 'en_curso' | 'bloqueado' | 'pendiente';

export type EditorialProfile = {
  id: string;
  name: string;
  site: string;
  model: string;
  cadence: string;
  defaultAuthor: string;
  sourceMinimum: number;
  endpoint: string;
  publicationDestinationIds?: string[];
  defaultPublicationDestinationId?: string;
  postingMode: 'manual' | 'asistido' | 'automatico';
  tone: string;
  guardrails: string[];
};

export type NoteRecipe = {
  id: EditarraRecipeKey;
  label: string;
  shortLabel: string;
  category: 'noticias' | 'tecnico' | 'proyectos' | 'empresa';
  publishAt: string;
  defaultDepth: 'Alta' | 'Media' | 'Breve';
  defaultTokens: number;
  intent: string;
  sourcePlan: string;
  variableKeys: string[];
};

export type GuidedRunStage = {
  id: string;
  label: string;
  detail: string;
  status: PipelineStageStatus;
};

export type GuidedRunInput = {
  profile: EditorialProfile;
  recipe: NoteRecipe;
  topicStatus: string;
  sourceCount: number;
  hasDraft: boolean;
  qualityStatus: string;
  hasPayload: boolean;
  blockers: number;
};

export type OperationModeVariable = {
  key: string;
  value: string;
  description: string;
};

export type EditorialOperationMode = {
  id: string;
  name: string;
  shortLabel: string;
  intent: string;
  recipeId: EditarraRecipeKey;
  authorName: string;
  profilePatch: Pick<EditorialProfile, 'sourceMinimum' | 'postingMode' | 'tone' | 'guardrails'>;
  authorPatch: {
    voiceBrief: string;
    influenceMode: string;
  };
  variables: OperationModeVariable[];
};

export const editorialProfiles: EditorialProfile[] = [
  {
    id: 'editarra-studio',
    name: 'UMSA Diaria',
    site: 'www.licitometro.ar/editarra',
    model: 'umsa-diaria',
    cadence: '3 notas/día',
    defaultAuthor: 'Editor UMSA Diaria',
    sourceMinimum: 4,
    endpoint: 'https://www.ultimamilla.com.ar/api/blog',
    publicationDestinationIds: ['umsa-blog', 'licitometro-json'],
    defaultPublicationDestinationId: 'umsa-blog',
    postingMode: 'asistido',
    tone: 'Tecnología abierta, evidencia primaria y didáctica técnica.',
    guardrails: [
      'No publicar sin 4 fuentes primarias.',
      'No hacer POST externo desde la UI local.',
      'Mantener tildes y eñes en texto visible.',
      'Aplicar influencias sin nombrarlas.',
    ],
  },
  {
    id: 'umsa-diaria',
    name: 'UMSA Diaria extendido',
    site: 'umsa.licitometro.ar/editarra',
    model: 'umsa-diaria',
    cadence: '3 notas/día',
    defaultAuthor: 'Editor UMSA Diaria',
    sourceMinimum: 4,
    endpoint: 'https://www.ultimamilla.com.ar/api/blog',
    publicationDestinationIds: ['umsa-blog', 'licitometro-json'],
    defaultPublicationDestinationId: 'umsa-blog',
    postingMode: 'asistido',
    tone: 'Mismo modelo, preparado para separar dominio propio cuando exista.',
    guardrails: [
      'Separar reactiva, evergreen y caso.',
      'Evitar reframe prohibido.',
      'Registrar auditoría antes de exportar.',
    ],
  },
];

export const operationModes: EditorialOperationMode[] = [
  {
    id: 'modo-alerta-regulatoria',
    name: 'Alerta regulatoria',
    shortLabel: 'Alerta',
    intent: 'Reaccionar rápido ante normas, cambios ARCA o infraestructura crítica con control de evidencia primaria.',
    recipeId: 'reactiva',
    authorName: 'Editor UMSA Diaria',
    profilePatch: {
      sourceMinimum: 4,
      postingMode: 'asistido',
      tone: 'Directo, verificable y útil para decidir hoy; explicar alcance, fecha y fuente primaria antes de opinar.',
      guardrails: [
        'No publicar alerta sin norma o fuente primaria visible.',
        'Separar hecho confirmado, impacto probable y pendiente de verificación.',
        'Mantener salida portable: ai_brief.json, quality_audit.json y publication_payload.json.',
      ],
    },
    authorPatch: {
      voiceBrief: 'Voz de mesa de guardia: precisa, sobria, con foco en lo que cambia y lo que todavía no se puede afirmar.',
      influenceMode: 'adherir a documentación oficial y reportes técnicos; evitar dramatización o predicción sin fuente',
    },
    variables: [
      {
        key: 'keyword_principal',
        value: 'alerta regulatoria ARCA',
        description: 'Keyword principal para nota reactiva de cambio normativo.',
      },
      {
        key: 'antagonista_operativo',
        value: 'operación fiscal sin evidencia trazable',
        description: 'Fricción operativa que la nota debe explicar sin exagerar.',
      },
      {
        key: 'norma_herramienta',
        value: 'norma oficial, documentación técnica y matriz de fuentes guiadas',
        description: 'Fuente normativa o herramienta que estructura el análisis.',
      },
      {
        key: 'fuente_puente',
        value: 'boletín oficial, documentación primaria y evidencia interna auditada',
        description: 'Puente de fuentes que sostiene la nota antes de AI.',
      },
    ],
  },
  {
    id: 'modo-guia-infraestructura',
    name: 'Guía de infraestructura',
    shortLabel: 'Guía',
    intent: 'Convertir problemas repetidos de operación en una guía evergreen con arquitectura, costos y primera prueba.',
    recipeId: 'evergreen',
    authorName: 'Editor UMSA Diaria',
    profilePatch: {
      sourceMinimum: 5,
      postingMode: 'asistido',
      tone: 'Didáctico, técnico y accionable; mostrar componentes, límites honestos y prueba mínima antes de recomendar.',
      guardrails: [
        'No prometer automatización sin prueba mínima reproducible.',
        'Incluir costo estimado y límite honesto.',
        'Evitar comparativas sin documentación oficial o experiencia auditada.',
      ],
    },
    authorPatch: {
      voiceBrief: 'Voz de arquitecto operativo: explica decisiones, tradeoffs y primer entregable sin vender humo.',
      influenceMode: 'adherir a documentación técnica, runbooks y experiencias propias; evitar tono de marketing SaaS',
    },
    variables: [
      {
        key: 'keyword_principal',
        value: 'infraestructura abierta para gestión documental',
        description: 'Keyword principal para búsqueda evergreen.',
      },
      {
        key: 'herramientas',
        value: 'PostgreSQL 17, MinIO, Keycloak, Passbolt, GLPI y Metabase',
        description: 'Stack que la nota debe explicar con roles claros.',
      },
      {
        key: 'costo_estimado',
        value: '35 a 90 USD mensuales, más horas de configuración y soporte',
        description: 'Rango honesto de costo operativo inicial.',
      },
      {
        key: 'primer_entregable',
        value: 'ambiente de prueba con usuario, archivo, registro, auditoría y restauración',
        description: 'Primer entregable verificable antes de publicar la guía.',
      },
    ],
  },
  {
    id: 'modo-caso-cuyano',
    name: 'Caso cuyano',
    shortLabel: 'Caso',
    intent: 'Bajar una implementación real o anonimizada a relato operativo, con protagonista, límite y prueba.',
    recipeId: 'caso',
    authorName: 'Editor UMSA Diaria',
    profilePatch: {
      sourceMinimum: 4,
      postingMode: 'asistido',
      tone: 'Narrativo pero verificable; partir de una situación local, mostrar decisiones y cerrar con prueba mínima.',
      guardrails: [
        'Anonimizar datos sensibles del caso.',
        'No inventar resultados ni métricas no auditadas.',
        'Separar aprendizaje general de contexto particular.',
      ],
    },
    authorPatch: {
      voiceBrief: 'Voz de crónica técnica local: humana, concreta, con evidencia y sin épica.',
      influenceMode: 'adherir a casos internos validados y entrevistas operativas; evitar heroísmo empresarial',
    },
    variables: [
      {
        key: 'protagonista',
        value: 'equipo administrativo cuyano con archivos críticos dispersos',
        description: 'Actor del caso, anonimizado y operativo.',
      },
      {
        key: 'antagonista_operativo',
        value: 'carpeta compartida sin dueño ni restauración probada',
        description: 'Problema concreto que empuja la decisión.',
      },
      {
        key: 'herramientas',
        value: 'MinIO, PostgreSQL, control de permisos y tablero de auditoría',
        description: 'Herramientas usadas en el caso.',
      },
      {
        key: 'prueba_minima',
        value: 'recuperar un archivo, validar dueño, fecha, permiso y registro de auditoría',
        description: 'Prueba mínima que demuestra el aprendizaje.',
      },
    ],
  },
];

export const noteRecipes: NoteRecipe[] = [
  {
    id: 'reactiva',
    label: 'Nota A - Reactiva',
    shortLabel: 'Reactiva',
    category: 'noticias',
    publishAt: '07:00 -03:00',
    defaultDepth: 'Alta',
    defaultTokens: 10500,
    intent: 'Noticia o regulación argentina de las últimas 72 horas.',
    sourcePlan: 'Norma oficial + documentación técnica + fuente de contexto + evidencia operativa.',
    variableKeys: ['keyword_principal', 'antagonista_operativo', 'norma_herramienta', 'fuente_puente'],
  },
  {
    id: 'evergreen',
    label: 'Nota B - Evergreen técnica',
    shortLabel: 'Evergreen',
    category: 'tecnico',
    publishAt: '12:00 -03:00',
    defaultDepth: 'Media',
    defaultTokens: 9800,
    intent: 'Guía, comparativa o arquitectura que pueda sostener búsqueda.',
    sourcePlan: 'Documentación de herramientas + guía de backup + referencia de permisos + costo.',
    variableKeys: ['keyword_principal', 'herramientas', 'costo_estimado', 'primer_entregable'],
  },
  {
    id: 'caso',
    label: 'Nota C - Caso o proyecto',
    shortLabel: 'Caso',
    category: 'proyectos',
    publishAt: '17:00 -03:00',
    defaultDepth: 'Media',
    defaultTokens: 9200,
    intent: 'Mini caso cuyano o implementación anonimizada con flujo verificable.',
    sourcePlan: 'Caso interno validado + docs técnicas + evidencia de prueba + fuente sectorial.',
    variableKeys: ['protagonista', 'antagonista_operativo', 'herramientas', 'prueba_minima'],
  },
  {
    id: 'empresa',
    label: 'Mirada de industria',
    shortLabel: 'Industria',
    category: 'empresa',
    publishAt: '17:00 -03:00',
    defaultDepth: 'Breve',
    defaultTokens: 7800,
    intent: 'Lectura de mercado con decisión, costo y límite.',
    sourcePlan: 'Pricing oficial + docs técnicas + fuente sectorial + caso interno anonimizado.',
    variableKeys: ['keyword_principal', 'decision_operativa', 'costo_estimado', 'limite_honesto'],
  },
];

export const defaultNoteVariableValues: Record<string, string> = {
  keyword_principal: 'depósitos fiscales ARCA',
  antagonista_operativo: 'carpeta compartida sin dueño',
  norma_herramienta: 'ARCA, PostgreSQL 17, MinIO y Metabase',
  fuente_puente: 'documentación primaria y evidencia diaria',
  herramientas: 'PostgreSQL 17, MinIO, Keycloak, Passbolt, GLPI, Metabase',
  costo_estimado: '35 a 90 USD mensuales, ARS pendiente de cotización',
  primer_entregable: 'carga de prueba con archivo, registro, responsable, vista y restauración',
  protagonista: 'gerente de cooperativa eléctrica con internet rural',
  prueba_minima: 'restaurar base y objeto, comparar fecha, dueño y archivo',
  decision_operativa: 'separar objetos pesados de registros transaccionales',
  limite_honesto: 'sin migración histórica incluida en la primera puesta',
};

const stageStatus = (passed: boolean, blocked = false): PipelineStageStatus => {
  if (blocked) {
    return 'bloqueado';
  }

  return passed ? 'listo' : 'pendiente';
};

const plural = (count: number, singular: string, pluralValue: string) => `${count} ${count === 1 ? singular : pluralValue}`;

export const buildGuidedRunStages = ({
  profile,
  recipe,
  topicStatus,
  sourceCount,
  hasDraft,
  qualityStatus,
  hasPayload,
  blockers,
}: GuidedRunInput): GuidedRunStage[] => {
  const topicReady = ['aprobado', 'redaccion', 'publicado'].includes(topicStatus);
  const sourcesReady = sourceCount >= profile.sourceMinimum;
  const qualityReady = qualityStatus === 'apto_para_revision';

  return [
    {
      id: 'profile',
      label: 'Perfil',
      detail: `${profile.name} · ${recipe.shortLabel}`,
      status: 'listo',
    },
    {
      id: 'agenda',
      label: 'Agenda',
      detail: topicReady ? `Tema en ${topicStatus}` : 'Aplicar receta o aprobar tema',
      status: stageStatus(topicReady),
    },
    {
      id: 'sources',
      label: 'Fuentes',
      detail: `${sourceCount}/${profile.sourceMinimum} ${sourceCount === 1 ? 'fuente' : 'fuentes'}`,
      status: stageStatus(sourcesReady, sourceCount === 0),
    },
    {
      id: 'ai',
      label: 'AI',
      detail: hasDraft
        ? 'Borrador generado o importado'
        : sourcesReady
          ? 'Pendiente de generación'
          : 'Completar fuentes antes de generar',
      status: hasDraft ? 'listo' : sourcesReady ? 'en_curso' : 'bloqueado',
    },
    {
      id: 'audit',
      label: 'Auditoría',
      detail: blockers > 0 ? plural(blockers, 'bloqueo', 'bloqueos') : qualityReady ? 'Apta para revisión' : 'Revisar quality_audit',
      status: stageStatus(qualityReady && blockers === 0, blockers > 0),
    },
    {
      id: 'payload',
      label: 'Payload',
      detail: blockers > 0 ? 'Resolver auditoría antes de publicar' : hasPayload ? 'JSON publicable disponible' : 'Pendiente de paquete',
      status: hasPayload && blockers === 0 ? 'listo' : blockers > 0 ? 'bloqueado' : 'pendiente',
    },
  ];
};
