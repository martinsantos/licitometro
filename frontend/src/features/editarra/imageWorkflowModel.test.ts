import {
  createImagePrompt,
  removeImagePromptFromWorkflow,
  toggleReusableImageId,
  updateImagePromptList,
} from './imageWorkflowModel';
import type { ImagePrompt } from './persistenceModel';

describe('imageWorkflowModel', () => {
  const prompts: ImagePrompt[] = [
    {
      id: 'img-1',
      title: 'Imagen uno',
      ratio: '16:9',
      status: 'Apto reutilizacion',
      prompt: 'Escena documental tecnica.',
    },
    {
      id: 'img-2',
      title: 'Imagen dos',
      ratio: '1:1',
      status: 'Nuevo',
      prompt: 'Otra escena.',
    },
  ];

  it('creates a deterministic default image prompt', () => {
    expect(createImagePrompt({ id: 'img-new' })).toEqual({
      id: 'img-new',
      title: 'Nuevo prompt visual',
      ratio: '16:9',
      status: 'Nuevo',
      prompt: 'Describe escena, encuadre, luz, estilo documental, restricciones y negativos.',
    });
  });

  it('updates only the selected image prompt', () => {
    const updated = updateImagePromptList(prompts, 'img-2', {
      title: 'Imagen editada',
      ratio: '4:3',
    });

    expect(updated[0]).toBe(prompts[0]);
    expect(updated[1]).toMatchObject({
      id: 'img-2',
      title: 'Imagen editada',
      ratio: '4:3',
      status: 'Nuevo',
    });
  });

  it('toggles reusable images without duplicating ids', () => {
    expect(toggleReusableImageId(['img-1'], 'img-2')).toEqual(['img-2', 'img-1']);
    expect(toggleReusableImageId(['img-1', 'img-2'], 'img-2')).toEqual(['img-1']);
  });

  it('removes image prompts and clears reusable references', () => {
    expect(removeImagePromptFromWorkflow({
      imagePrompts: prompts,
      reusableImages: ['img-1', 'img-2'],
      imageId: 'img-2',
    })).toEqual({
      imagePrompts: [prompts[0]],
      reusableImages: ['img-1'],
      removed: true,
    });
  });

  it('keeps the last image prompt so the workflow never renders empty', () => {
    expect(removeImagePromptFromWorkflow({
      imagePrompts: [prompts[0]],
      reusableImages: ['img-1'],
      imageId: 'img-1',
    })).toEqual({
      imagePrompts: [prompts[0]],
      reusableImages: ['img-1'],
      removed: false,
    });
  });
});
