import {
  createBlankAuthorInfluence,
  createDefaultAuthor,
  createDefaultTopic,
  createDefaultWorkflowVariable,
  reduceEditarraDomainState,
} from './domainReducer';
import type { EditarraDomainState } from './domainReducer';
import type { Author, Topic, WorkflowVariable } from './workspaceModel';

const styleWeights = { claridad: 80, evidencia: 85, opinion: 30, humanidad: 70, seo: 60 };

const authorA: Author = {
  id: 'author-a',
  name: 'Autor A',
  role: 'Editor',
  active: true,
  models: 'writer',
  tone: ['claro'],
  banned: ['hype'],
  mix: 'reactiva',
  score: 80,
  voiceBrief: 'Voz A',
  register: 'periodistico',
  rhythm: 'corto',
  stance: 'evidencia',
  density: 'media',
  locality: 'Argentina',
  influenceMode: 'invisible',
  references: ['docs'],
  antiReferences: ['clickbait'],
  styleWeights,
  influences: [{ id: 'inf-a', reference: 'Docs', relation: 'adherir', weight: 70, notes: 'Usar.' }],
};

const authorB: Author = {
  ...authorA,
  id: 'author-b',
  name: 'Autor B',
  score: 72,
};

const topicA: Topic = {
  id: 'topic-a',
  title: 'Tema A',
  status: 'sugerido',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Autor A',
  source: 'Fuente',
  narrative: 'Narrativa',
  seo: 'SEO',
  publishAt: 'Sin fecha',
};

const variableA: WorkflowVariable = {
  id: 'var-a',
  key: 'keyword_principal',
  value: 'base',
  scope: 'editor',
  description: 'Keyword',
  enabled: true,
};

const makeState = (): EditarraDomainState => ({
  authors: [authorA, authorB],
  topics: [topicA],
  workflowVariables: [variableA],
  noteVariableOverrides: [],
  selectedTopicId: topicA.id,
  query: 'tema',
  statusFilter: 'sugerido',
});

describe('domainReducer', () => {
  it('creates default author, topic, variable and influence objects used by the UI', () => {
    expect(createDefaultTopic({ id: 'topic-new', authorName: 'Autor A' })).toMatchObject({
      id: 'topic-new',
      title: 'Nuevo tema editorial',
      author: 'Autor A',
      status: 'sugerido',
    });
    expect(createDefaultAuthor({ id: 'author-new', influenceId: 'inf-new', styleWeights })).toMatchObject({
      id: 'author-new',
      name: 'Nuevo Autor',
      influences: [{ id: 'inf-new', relation: 'consultar' }],
    });
    expect(createDefaultWorkflowVariable('var-new')).toMatchObject({
      id: 'var-new',
      key: 'nueva_variable',
      scope: 'sistema',
    });
    expect(createBlankAuthorInfluence('inf-blank')).toMatchObject({
      id: 'inf-blank',
      reference: 'Nueva referencia',
      relation: 'adherir',
    });
  });

  it('adds and removes topics while keeping selection, filters and note overrides consistent', () => {
    const addedTopic = createDefaultTopic({ id: 'topic-new', authorName: 'Autor A' });
    const withTopic = reduceEditarraDomainState(makeState(), { type: 'topic/add', topic: addedTopic });
    const withOverride = reduceEditarraDomainState(withTopic, {
      type: 'note-variable/upsert',
      topicId: 'topic-new',
      recipeId: 'reactiva',
      key: 'fuente_puente',
      value: 'GitHub Octoverse',
      idFactory: () => 'override-new',
    });
    const removed = reduceEditarraDomainState(withOverride, { type: 'topic/remove', topicId: 'topic-new' });

    expect(withTopic.selectedTopicId).toBe('topic-new');
    expect(withTopic.query).toBe('');
    expect(withTopic.statusFilter).toBe('todos');
    expect(withOverride.noteVariableOverrides).toHaveLength(1);
    expect(removed.selectedTopicId).toBe('topic-a');
    expect(removed.topics.map((topic) => topic.id)).toEqual(['topic-a']);
    expect(removed.noteVariableOverrides).toHaveLength(0);
  });

  it('adds many topics atomically for generated daily batches', () => {
    const topicB = createDefaultTopic({ id: 'topic-b', authorName: 'Autor A' });
    const topicC = createDefaultTopic({ id: 'topic-c', authorName: 'Autor B' });
    const withBatch = reduceEditarraDomainState(makeState(), {
      type: 'topic/add-many',
      topics: [topicB, topicC],
      selectedTopicId: topicB.id,
    });

    expect(withBatch.selectedTopicId).toBe('topic-b');
    expect(withBatch.query).toBe('');
    expect(withBatch.statusFilter).toBe('todos');
    expect(withBatch.topics.map((topic) => topic.id)).toEqual(['topic-a', 'topic-b', 'topic-c']);
  });

  it('renames and removes authors while cascading topic ownership', () => {
    const renamed = reduceEditarraDomainState(makeState(), {
      type: 'author/update-field',
      authorId: 'author-a',
      field: 'name',
      value: 'Autor A editado',
    });
    const removed = reduceEditarraDomainState(renamed, {
      type: 'author/remove',
      authorId: 'author-a',
    });

    expect(renamed.authors[0].name).toBe('Autor A editado');
    expect(renamed.topics[0].author).toBe('Autor A editado');
    expect(removed.authors.map((author) => author.id)).toEqual(['author-b']);
    expect(removed.topics[0].author).toBe('Autor B');
  });

  it('updates author lists, weights, influences and workflow variables immutably', () => {
    const updatedList = reduceEditarraDomainState(makeState(), {
      type: 'author/update-list',
      authorId: 'author-a',
      field: 'tone',
      value: 'claro, preciso, rioplatense',
    });
    const updatedWeight = reduceEditarraDomainState(updatedList, {
      type: 'author/update-weight',
      authorId: 'author-a',
      key: 'evidencia',
      value: 95,
    });
    const withInfluence = reduceEditarraDomainState(updatedWeight, {
      type: 'author/add-influence',
      authorId: 'author-a',
      influence: createBlankAuthorInfluence('inf-extra'),
    });
    const updatedVariable = reduceEditarraDomainState(withInfluence, {
      type: 'variable/update',
      variableId: 'var-a',
      patch: { value: 'actualizado', enabled: false },
    });

    expect(updatedList.authors[0].tone).toEqual(['claro', 'preciso', 'rioplatense']);
    expect(updatedWeight.authors[0].styleWeights.evidencia).toBe(95);
    expect(withInfluence.authors[0].influences.map((influence) => influence.id)).toContain('inf-extra');
    expect(updatedVariable.workflowVariables[0]).toMatchObject({ value: 'actualizado', enabled: false });
    expect(makeState().workflowVariables[0].value).toBe('base');
  });
});
