import type { ImagePrompt } from './persistenceModel';

export type ImagePromptCreationInput = {
  id: string;
  title?: string;
  ratio?: string;
  status?: string;
  prompt?: string;
};

export type ImagePromptRemovalInput = {
  imagePrompts: ImagePrompt[];
  reusableImages: string[];
  imageId: string;
  minimumImages?: number;
};

export type ImagePromptRemovalResult = {
  imagePrompts: ImagePrompt[];
  reusableImages: string[];
  removed: boolean;
};

export const createImagePrompt = ({
  id,
  title = 'Nuevo prompt visual',
  ratio = '16:9',
  status = 'Nuevo',
  prompt = 'Describe escena, encuadre, luz, estilo documental, restricciones y negativos.',
}: ImagePromptCreationInput): ImagePrompt => ({
  id,
  title,
  ratio,
  status,
  prompt,
});

export const updateImagePromptList = (
  imagePrompts: ImagePrompt[],
  imageId: string,
  patch: Partial<ImagePrompt>,
) => imagePrompts.map((image) => (
  image.id === imageId ? { ...image, ...patch } : image
));

export const toggleReusableImageId = (
  reusableImages: string[],
  imageId: string,
) => (
  reusableImages.includes(imageId)
    ? reusableImages.filter((id) => id !== imageId)
    : [imageId, ...reusableImages.filter((id) => id !== imageId)]
);

export const removeImagePromptFromWorkflow = ({
  imagePrompts,
  reusableImages,
  imageId,
  minimumImages = 1,
}: ImagePromptRemovalInput): ImagePromptRemovalResult => {
  if (imagePrompts.length <= minimumImages) {
    return {
      imagePrompts,
      reusableImages,
      removed: false,
    };
  }

  return {
    imagePrompts: imagePrompts.filter((image) => image.id !== imageId),
    reusableImages: reusableImages.filter((id) => id !== imageId),
    removed: true,
  };
};
