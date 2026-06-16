import { upsertNoteVariableOverride } from './workspaceModel';
import type {
  Author,
  AuthorField,
  AuthorInfluence,
  NoteVariableOverride,
  StyleWeightKey,
  Topic,
  TopicStatus,
  VariableScope,
  WorkflowVariable,
} from './workspaceModel';
import type { EditarraRecipeKey } from './profileModel';

export type EditarraStatusFilter = TopicStatus | 'todos';

export type EditarraDomainState = {
  authors: Author[];
  topics: Topic[];
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  selectedTopicId: string;
  query: string;
  statusFilter: EditarraStatusFilter;
};

export type EditarraDomainAction =
  | { type: 'topic/status'; topicId: string; status: TopicStatus }
  | { type: 'topic/update'; topicId: string; patch: Partial<Topic> }
  | { type: 'topic/add'; topic: Topic }
  | { type: 'topic/add-many'; topics: Topic[]; selectedTopicId?: string }
  | { type: 'topic/remove'; topicId: string }
  | { type: 'author/toggle'; authorId: string }
  | { type: 'author/update-field'; authorId: string; field: AuthorField; value: string | number }
  | { type: 'author/update-list'; authorId: string; field: 'tone' | 'banned' | 'references' | 'antiReferences'; value: string }
  | { type: 'author/update-weight'; authorId: string; key: StyleWeightKey; value: number }
  | { type: 'author/update-influence'; authorId: string; influenceId: string; patch: Partial<AuthorInfluence> }
  | { type: 'author/add-influence'; authorId: string; influence: AuthorInfluence }
  | { type: 'author/remove-influence'; authorId: string; influenceId: string }
  | { type: 'author/add'; author: Author }
  | { type: 'author/remove'; authorId: string }
  | { type: 'variable/update'; variableId: string; patch: Partial<WorkflowVariable> }
  | { type: 'variable/add'; variable: WorkflowVariable }
  | { type: 'variable/remove'; variableId: string }
  | {
      type: 'note-variable/upsert';
      topicId: string;
      recipeId: EditarraRecipeKey;
      key: string;
      value: string;
      description?: string;
      idFactory?: () => string;
    };

const parseListInput = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export const createDefaultTopic = ({
  id,
  authorName,
}: {
  id: string;
  authorName: string;
}): Topic => ({
  id,
  title: 'Nuevo tema editorial',
  status: 'sugerido',
  priority: 70,
  depth: 'Media',
  tokens: 9000,
  author: authorName,
  source: 'Fuente pendiente',
  narrative: 'Define el angulo, la promesa y los limites de evidencia.',
  seo: 'Keyword principal pendiente. Titulo descriptivo, sin clickbait.',
  publishAt: 'Sin fecha',
});

export const createDefaultAuthorInfluence = (id: string): AuthorInfluence => ({
  id,
  reference: 'Referencia editorial',
  relation: 'consultar',
  weight: 60,
  notes: 'Explica como esta referencia debe afectar la voz.',
});

export const createBlankAuthorInfluence = (id: string): AuthorInfluence => ({
  id,
  reference: 'Nueva referencia',
  relation: 'adherir',
  weight: 60,
  notes: 'Indica que debe tomar, consultar o evitar de esta influencia.',
});

export const createDefaultAuthor = ({
  id,
  influenceId,
  styleWeights,
}: {
  id: string;
  influenceId: string;
  styleWeights: Author['styleWeights'];
}): Author => ({
  id,
  name: 'Nuevo Autor',
  role: 'Rol editorial pendiente',
  active: true,
  models: 'writer: provider-agnostic, editor: revision-humana',
  tone: ['claro', 'preciso'],
  banned: ['clickbait'],
  mix: '50% notas breves, 50% explicadores',
  score: 70,
  voiceBrief: 'Define una voz editorial verificable antes de publicar.',
  register: 'claro y sobrio',
  rhythm: 'frases medias',
  stance: 'neutral con evidencia',
  density: 'media',
  locality: 'Argentina',
  influenceMode: 'adherir a referencias utiles y evitar imitacion literal',
  references: ['referencia editorial'],
  antiReferences: ['clickbait'],
  styleWeights: { ...styleWeights },
  influences: [createDefaultAuthorInfluence(influenceId)],
});

export const createDefaultWorkflowVariable = (id: string): WorkflowVariable => ({
  id,
  key: 'nueva_variable',
  value: 'valor',
  scope: 'sistema' as VariableScope,
  description: 'Describe como se usa esta variable en el workflow.',
  enabled: true,
});

export const reduceEditarraDomainState = (
  state: EditarraDomainState,
  action: EditarraDomainAction,
): EditarraDomainState => {
  switch (action.type) {
    case 'topic/status':
      return {
        ...state,
        selectedTopicId: action.topicId,
        topics: state.topics.map((topic) => (
          topic.id === action.topicId ? { ...topic, status: action.status } : topic
        )),
      };

    case 'topic/update':
      return {
        ...state,
        selectedTopicId: action.topicId,
        topics: state.topics.map((topic) => (
          topic.id === action.topicId ? { ...topic, ...action.patch } : topic
        )),
      };

    case 'topic/add':
      return {
        ...state,
        query: '',
        statusFilter: 'todos',
        selectedTopicId: action.topic.id,
        topics: [...state.topics, action.topic],
      };

    case 'topic/add-many': {
      if (action.topics.length === 0) {
        return state;
      }

      return {
        ...state,
        query: '',
        statusFilter: 'todos',
        selectedTopicId: action.selectedTopicId || action.topics[0].id,
        topics: [...state.topics, ...action.topics],
      };
    }

    case 'topic/remove': {
      if (state.topics.length <= 1) {
        return state;
      }

      const fallbackTopic = state.topics.find((topic) => topic.id !== action.topicId) || state.topics[0];

      return {
        ...state,
        selectedTopicId: fallbackTopic.id,
        topics: state.topics.filter((topic) => topic.id !== action.topicId),
        noteVariableOverrides: state.noteVariableOverrides.filter((override) => override.topicId !== action.topicId),
      };
    }

    case 'author/toggle':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId ? { ...author, active: !author.active } : author
        )),
      };

    case 'author/update-field': {
      const currentAuthor = state.authors.find((author) => author.id === action.authorId);
      const authors = state.authors.map((author) => (
        author.id === action.authorId ? { ...author, [action.field]: action.value } : author
      ));
      const topics = action.field === 'name' && currentAuthor
        ? state.topics.map((topic) => (
            topic.author === currentAuthor.name ? { ...topic, author: String(action.value) } : topic
          ))
        : state.topics;

      return { ...state, authors, topics };
    }

    case 'author/update-list':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId
            ? { ...author, [action.field]: parseListInput(action.value) }
            : author
        )),
      };

    case 'author/update-weight':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId
            ? { ...author, styleWeights: { ...author.styleWeights, [action.key]: action.value } }
            : author
        )),
      };

    case 'author/update-influence':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId
            ? {
                ...author,
                influences: author.influences.map((influence) => (
                  influence.id === action.influenceId ? { ...influence, ...action.patch } : influence
                )),
              }
            : author
        )),
      };

    case 'author/add-influence':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId
            ? { ...author, influences: [...author.influences, action.influence] }
            : author
        )),
      };

    case 'author/remove-influence':
      return {
        ...state,
        authors: state.authors.map((author) => (
          author.id === action.authorId
            ? { ...author, influences: author.influences.filter((influence) => influence.id !== action.influenceId) }
            : author
        )),
      };

    case 'author/add':
      return {
        ...state,
        authors: [...state.authors, action.author],
      };

    case 'author/remove': {
      const author = state.authors.find((item) => item.id === action.authorId);

      if (!author || state.authors.length <= 1) {
        return state;
      }

      const fallbackAuthor = state.authors.find((item) => item.id !== action.authorId) || state.authors[0];

      return {
        ...state,
        authors: state.authors.filter((item) => item.id !== action.authorId),
        topics: state.topics.map((topic) => (
          topic.author === author.name ? { ...topic, author: fallbackAuthor.name } : topic
        )),
      };
    }

    case 'variable/update':
      return {
        ...state,
        workflowVariables: state.workflowVariables.map((variable) => (
          variable.id === action.variableId ? { ...variable, ...action.patch } : variable
        )),
      };

    case 'variable/add':
      return {
        ...state,
        workflowVariables: [...state.workflowVariables, action.variable],
      };

    case 'variable/remove':
      return {
        ...state,
        workflowVariables: state.workflowVariables.filter((variable) => variable.id !== action.variableId),
      };

    case 'note-variable/upsert':
      return {
        ...state,
        noteVariableOverrides: upsertNoteVariableOverride(state.noteVariableOverrides, {
          topicId: action.topicId,
          recipeId: action.recipeId,
          key: action.key,
          value: action.value,
          description: action.description,
          idFactory: action.idFactory,
        }),
      };

    default:
      return state;
  }
};
