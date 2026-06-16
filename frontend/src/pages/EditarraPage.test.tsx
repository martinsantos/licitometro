import { act, fireEvent, render, screen, within } from '@testing-library/react';
import EditarraPage from './EditarraPage';
import { editarraRadarApi } from '../features/editarra/editarraRadarApi';

jest.mock('../features/editarra/editarraRadarApi', () => ({
  editarraRadarApi: {
    listAgendas: jest.fn(),
    createAgenda: jest.fn(),
    updateAgenda: jest.fn(),
    deleteAgenda: jest.fn(),
    listCandidates: jest.fn(),
    listRuns: jest.fn(),
    updateCandidate: jest.fn(),
    runDiscovery: jest.fn(),
    convertTopic: jest.fn(),
    convertNoteRun: jest.fn(),
  },
}));

function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

const getMockRadarApi = () => editarraRadarApi as jest.Mocked<typeof editarraRadarApi>;

async function renderEditarraPage() {
  let result: ReturnType<typeof render> | undefined;

  await act(async () => {
    result = render(<EditarraPage />);
    await Promise.resolve();
    await Promise.resolve();
  });

  return result;
}

describe('EditarraPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    const mockRadarApi = getMockRadarApi();
    mockRadarApi.listAgendas.mockResolvedValue({ agendas: [] });
    mockRadarApi.listCandidates.mockResolvedValue({ candidates: [] });
    mockRadarApi.listRuns.mockResolvedValue({ runs: [] });
    mockRadarApi.createAgenda.mockResolvedValue({ agenda: {} as any });
    mockRadarApi.updateAgenda.mockImplementation(async (_operatorKey, agenda) => ({ agenda }));
    mockRadarApi.deleteAgenda.mockResolvedValue({ ok: true, id: 'agenda-x' });
    mockRadarApi.updateCandidate.mockResolvedValue({ candidate: {} as any });
    mockRadarApi.convertTopic.mockResolvedValue({ candidate: {} as any, topic: {} });
    mockRadarApi.convertNoteRun.mockResolvedValue({ candidate: {} as any, topic: {}, noteRun: {} });
    mockRadarApi.runDiscovery.mockResolvedValue({
      run: {
        id: 'run-test',
        agendaId: 'agenda-umsa-diaria',
        query: 'ARCA CCTV',
        urls: ['https://example.com/arca'],
        status: 'completo',
        sourceCount: 1,
        candidateCount: 1,
        warnings: [],
        createdAt: '2026-06-06T00:00:00Z',
        completedAt: '2026-06-06T00:00:00Z',
      },
      candidates: [{
        id: 'cand-test',
        runId: 'run-test',
        agendaId: 'agenda-umsa-diaria',
        title: 'ARCA CCTV fiscal',
        summary: 'Resumen con evidencia operativa.',
        sourceName: 'Example',
        sourceUrl: 'https://example.com/arca',
        snippet: 'Snippet con datos auditables y evidencia diaria.',
        detectedTrope: 'norma nueva que exige evidencia',
        matchedInterests: ['datos auditables'],
        recommendedAuthor: 'Editor UMSA Diaria',
        recommendedRecipeId: 'reactiva',
        recommendedOperationModeId: 'modo-alerta-regulatoria',
        score: 91,
        warnings: [],
        status: 'descubierto',
        createdAt: '2026-06-06T00:00:00Z',
        updatedAt: '2026-06-06T00:00:00Z',
      }],
    });
  });

  it('starts directly in Operation with the guided workflow visible', async () => {
    await renderEditarraPage();

    expect(screen.getByRole('heading', { name: /^editarra$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /operacion/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: /operacion/i })).toBeInTheDocument();
    expect(screen.getByText(/flujo guiado de nota/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pasos del flujo operativo/i)).toBeInTheDocument();
  });

  it('uses Operation shortcuts to open candidate review instead of forcing manual navigation', async () => {
    await renderEditarraPage();

    fireEvent.click(screen.getByRole('button', { name: /revisar candidatos/i }));

    expect(screen.getByRole('tab', { name: /agenda/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /^candidatos$/i })).toHaveClass('bg-slate-950');
    expect(screen.getByText(/preseleccion y conversion/i)).toBeInTheDocument();
  });

  it('opens the authors module and keeps author fields editable', async () => {
    await renderEditarraPage();

    openTab(/autores/i);

    expect(screen.getByText(/mesa de autores/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^editar$/i })[0]);

    const toneInput = screen.getByLabelText(/tono editor umsa diaria/i);
    fireEvent.change(toneInput, { target: { value: 'preciso, local, verificable' } });
    expect(toneInput).toHaveValue('preciso, local, verificable');

    const nameInput = screen.getByLabelText(/nombre editor umsa diaria/i);
    fireEvent.change(nameInput, { target: { value: 'Editor UMSA Diario QA' } });
    expect(nameInput).toHaveValue('Editor UMSA Diario QA');
  });

  it('opens config and edits portable variables in place', async () => {
    await renderEditarraPage();

    openTab(/config/i);

    expect(screen.getByText(/config editable por sitio/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^editar$/i })[0]);

    const siteId = screen.getByLabelText(/valor site_id/i);
    fireEvent.change(siteId, { target: { value: 'editarra-qa' } });
    expect(siteId).toHaveValue('editarra-qa');

    fireEvent.click(screen.getByRole('button', { name: /lote y export/i }));
    fireEvent.click(screen.getByRole('button', { name: /exportar json/i }));
    expect(screen.getByLabelText(/workflow json/i)).toHaveTextContent('"site_id"');
    expect(screen.getByLabelText(/workflow json/i)).toHaveTextContent('editarra-qa');
  });

  it('opens audit evidence and metric editors as modals instead of inline sheets', async () => {
    await renderEditarraPage();

    openTab(/auditoria/i);

    fireEvent.click(screen.getByRole('button', { name: /nueva evidencia/i }));
    let dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/fuente evidencia/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^cerrar$/i }));

    fireEvent.click(screen.getAllByRole('button', { name: /^metricas$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /nueva metrica/i }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/periodo metrica/i)).toBeInTheDocument();
  });

  it('opens the advanced editor only when requested and generates an editable note run', async () => {
    await renderEditarraPage();

    openTab(/editor/i);

    const cockpit = screen.getAllByLabelText(/cockpit de corrida editarra/i)[0];
    expect(cockpit).toHaveTextContent(/corrida activa/i);
    expect(screen.getAllByLabelText(/perfil operativo de nota/i)[0]).toHaveTextContent(/workspace operativo/i);

    fireEvent.change(within(cockpit).getByLabelText(/título nueva corrida cockpit/i), {
      target: { value: 'Nota QA generada por perfil' },
    });
    fireEvent.click(within(cockpit).getByRole('button', { name: /crear corrida y generar/i }));

    expect(screen.getByRole('tab', { name: /editor/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByLabelText(/estado operativo de corrida/i)[0]).toHaveTextContent(/corrida creada/i);
    fireEvent.click(screen.getAllByRole('button', { name: /borrador/i })[0]);
    expect((screen.getByLabelText(/cuerpo del borrador/i) as HTMLTextAreaElement).value)
      .toContain('Nota QA generada por perfil');
  });

  it('runs the guided generator and opens portable runtime artifacts without API calls', async () => {
    await renderEditarraPage();

    openTab(/editor/i);
    fireEvent.click(screen.getByRole('button', { name: /playbook/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /generar con perfil/i })[0]);

    expect(screen.getByRole('tab', { name: /editor/i })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getAllByRole('button', { name: /borrador/i })[0]);
    expect((screen.getByLabelText(/cuerpo del borrador/i) as HTMLTextAreaElement).value)
      .toContain('Contrato de generación EDITARRA');

    fireEvent.click(screen.getByRole('button', { name: /comando/i }));
    fireEvent.click(within(screen.getByLabelText(/comando operativo de nota/i)).getByRole('button', {
      name: /abrir receta operativa automation_recipe\.json/i,
    }));

    expect(screen.getByRole('tab', { name: /config/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/archivo del paquete editorial/i)).toHaveTextContent('"executionPreflight"');
    expect(screen.getByLabelText(/archivo del paquete editorial/i)).toHaveTextContent('"recommendedCommand"');
  });

  it('runs Radar discovery, converts a candidate into a topic and prepares a NoteRun', async () => {
    await renderEditarraPage();

    openTab(/agenda/i);

    fireEvent.change(screen.getByPlaceholderText(/infraestructura abierta argentina/i), {
      target: { value: 'ARCA CCTV' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buscar temas/i }));
      await Promise.resolve();
    });

    expect(getMockRadarApi().runDiscovery).toHaveBeenCalledWith('', expect.objectContaining({
      agendaId: 'agenda-umsa-diaria',
      query: 'ARCA CCTV',
    }));
    expect(screen.getByText(/discovery completado: 1 candidatos/i)).toBeInTheDocument();
    expect(screen.queryByText(/candidato local creado/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /candidatos/i }));
    expect(await screen.findByText(/ARCA CCTV fiscal/i)).toBeInTheDocument();
    expect(screen.getByText(/QA/i)).toBeInTheDocument();
    expect(screen.getAllByText(/URLs consultadas/i).length).toBeGreaterThan(0);
    const candidateCard = screen.getByText(/ARCA CCTV fiscal/i).closest('article') as HTMLElement;

    fireEvent.click(within(candidateCard).getByRole('button', { name: /convertir en tema/i }));
    fireEvent.click(screen.getByRole('button', { name: /parrilla/i }));
    expect(screen.getAllByText(/ARCA CCTV fiscal/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/norma nueva que exige evidencia/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /candidatos/i }));
    const convertedCandidateCard = screen.getAllByText(/ARCA CCTV fiscal/i)[0].closest('article') as HTMLElement;
    fireEvent.click(within(convertedCandidateCard).getByRole('button', { name: /crear noterun/i }));
    expect(screen.getByRole('tab', { name: /editor/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/noterun preparado/i)).toBeInTheDocument();
  });

  it('imports discovery_results.json into candidate review without leaving Agenda', async () => {
    await renderEditarraPage();

    openTab(/agenda/i);
    fireEvent.click(screen.getByRole('button', { name: /agenda config/i }));

    fireEvent.change(screen.getByPlaceholderText('{"candidates":[...]}'), {
      target: {
        value: JSON.stringify({
          discovery_candidates: [{
            id: 'cand-import-ui',
            title: 'Tema importado desde AI externa',
            summary: 'Resumen importado para revisión humana.',
            sourceUrl: 'https://example.com/importado',
            detectedTrope: 'norma nueva que exige evidencia',
            matchedInterests: ['datos auditables'],
            score: 81,
          }],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar candidatos/i }));

    fireEvent.click(screen.getByRole('button', { name: /^candidatos$/i }));
    expect(screen.getByText(/tema importado desde ai externa/i)).toBeInTheDocument();
    expect(screen.getAllByText(/datos auditables/i).length).toBeGreaterThan(0);
  });

  it('shows publication preview targets and visual manifest without enabling CMS POST', async () => {
    await renderEditarraPage();

    openTab(/publicacion/i);

    expect(screen.getByText(/previa publicable y payloads por cms/i)).toBeInTheDocument();
    expect(screen.getByText(/salida publica/i)).toBeInTheDocument();
    expect(screen.getByText(/public_export_bundle\.json/i)).toBeInTheDocument();
    expect(screen.getByText(/editorial_proposal\.json/i)).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: /publicacion/i })).getAllByText(/^image_manifest\.json$/i)).toHaveLength(1);
    expect(screen.getByText(/preview umsa blog/i)).toBeInTheDocument();
    expect(screen.getAllByText(/umsa blog/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/v1 no envía post externo/i)).toBeInTheDocument();
    expect(screen.getAllByText(/imagen/i).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /marcar enviado\/manual/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /copiar payload/i }));
    expect(screen.getByRole('tab', { name: /config/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/archivo del paquete editorial/i)).toHaveTextContent('"titulo"');
  });

  it('shows note image workflow with auditable prompt manifest', async () => {
    await renderEditarraPage();

    openTab(/imagenes/i);

    expect(screen.getByText(/prompt, manifiesto y previa visual umsa/i)).toBeInTheDocument();
    expect(screen.getAllByText(/prompt pip/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/prompt pip imagen/i)).toHaveTextContent(/sin texto visible/i);
    expect(screen.getByText(/manifiesto activo/i)).toBeInTheDocument();
    expect(screen.getByText(/ruta destino/i)).toBeInTheDocument();
    expect(screen.getAllByText(/editarra-images-/i).length).toBeGreaterThan(0);
  });

  it('shows latest run candidates by default and exposes historical mode explicitly', async () => {
    const mockRadarApi = getMockRadarApi();
    mockRadarApi.listAgendas.mockResolvedValue({
      agendas: [{
        id: 'agenda-umsa-diaria',
        name: 'UMSA Diaria - Tecnologia abierta',
        destination: 'www.ultimamilla.com.ar/blog',
        audience: 'Pymes',
        compatibleAuthors: ['Editor UMSA Diaria'],
        compatibleRecipes: ['reactiva'],
        compatibleOperationModes: ['modo-alerta-regulatoria'],
        interests: ['infraestructura abierta'],
        tropesToSeek: ['norma nueva que exige evidencia'],
        tropesToAvoid: [],
        sourceUrls: ['https://example.com/base'],
        scoringWeights: { interest: 1, trope: 1, source: 1, avoidPenalty: 1 },
        publishingSlots: ['AM'],
      }],
    } as any);
    mockRadarApi.listRuns.mockResolvedValue({
      runs: [
        {
          id: 'run-new',
          agendaId: 'agenda-umsa-diaria',
          query: 'software',
          urls: ['https://example.com/new'],
          status: 'completo',
          sourceCount: 1,
          candidateCount: 1,
          warnings: [],
          createdAt: '2026-06-08T10:00:00Z',
          completedAt: '2026-06-08T10:00:00Z',
        },
        {
          id: 'run-old',
          agendaId: 'agenda-umsa-diaria',
          query: 'legacy',
          urls: ['https://example.com/old'],
          status: 'completo',
          sourceCount: 1,
          candidateCount: 1,
          warnings: [],
          createdAt: '2026-06-07T10:00:00Z',
          completedAt: '2026-06-07T10:00:00Z',
        },
      ],
    } as any);
    mockRadarApi.listCandidates.mockResolvedValue({
      candidates: [
        {
          id: 'cand-new',
          runId: 'run-new',
          agendaId: 'agenda-umsa-diaria',
          title: 'Nuevo candidato visible',
          summary: 'Resumen nuevo.',
          sourceName: 'Example',
          sourceUrl: 'https://example.com/new',
          snippet: 'snippet nuevo',
          detectedTrope: 'norma nueva que exige evidencia',
          matchedInterests: ['infraestructura abierta'],
          recommendedAuthor: 'Editor UMSA Diaria',
          recommendedRecipeId: 'reactiva',
          recommendedOperationModeId: 'modo-alerta-regulatoria',
          score: 70,
          warnings: [],
          status: 'descubierto',
          createdAt: '2026-06-08T10:00:00Z',
          updatedAt: '2026-06-08T10:00:00Z',
        },
        {
          id: 'cand-old',
          runId: 'run-old',
          agendaId: 'agenda-umsa-diaria',
          title: 'Candidato historico oculto',
          summary: 'Resumen viejo.',
          sourceName: 'Example',
          sourceUrl: 'https://example.com/old',
          snippet: 'snippet viejo',
          detectedTrope: 'norma nueva que exige evidencia',
          matchedInterests: ['infraestructura abierta'],
          recommendedAuthor: 'Editor UMSA Diaria',
          recommendedRecipeId: 'reactiva',
          recommendedOperationModeId: 'modo-alerta-regulatoria',
          score: 99,
          warnings: [],
          status: 'descubierto',
          createdAt: '2026-06-07T10:00:00Z',
          updatedAt: '2026-06-07T10:00:00Z',
        },
      ],
    } as any);

    await renderEditarraPage();

    openTab(/agenda/i);
    fireEvent.click(screen.getByRole('button', { name: /candidatos/i }));

    expect(await screen.findByText(/nuevo candidato visible/i)).toBeInTheDocument();
    expect(screen.queryByText(/candidato historico oculto/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mostrando ultimo run/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/alcance/i), { target: { value: 'historico' } });

    expect(await screen.findByText(/candidato historico oculto/i)).toBeInTheDocument();
    expect(screen.getByText(/mostrando historico/i)).toBeInTheDocument();
  });

  it('edits a topic directly from Parrilla and selects newly created topics', async () => {
    await renderEditarraPage();

    openTab(/agenda/i);
    fireEvent.click(screen.getByRole('button', { name: /parrilla/i }));

    fireEvent.click(screen.getAllByRole('button', { name: /^editar$/i })[0]);
    const titleInput = screen.getByLabelText(/titulo tema/i);
    fireEvent.change(titleInput, {
      target: { value: 'Tema QA editable desde parrilla' },
    });

    expect(screen.getAllByText(/tema qa editable desde parrilla/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /nuevo tema/i }));
    expect(screen.getByLabelText(/titulo tema/i)).toHaveValue('Nuevo tema editorial');
    fireEvent.change(screen.getByLabelText(/titulo tema/i), {
      target: { value: 'Nuevo tema creado y seleccionado' },
    });
    expect(screen.getAllByText(/nuevo tema creado y seleccionado/i).length).toBeGreaterThan(0);
  });
});
