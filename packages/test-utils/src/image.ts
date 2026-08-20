import { generateImage as generateImageCallback } from 'js-image-generator'

/* eslint-disable n/no-unsupported-features/node-builtins */

/**
 * Returns a generated random-noise JPEG image with the specified dimensions.
 */
export async function generateImage(width: number, height: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    generateImageCallback(width, height, 80, (error, image) => {
      if (error) {
        reject(error)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const imageBuffer = image.data as Buffer

        resolve(imageBuffer)
      }
    })
  })
}

/**
 * Creates a server handler that responds with a generated random-noise image.
 */
export function createImageServerHandler(imageConfigFromURL: (url: URL) => { width: number; height: number } | null) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const imageConfig = imageConfigFromURL(url)

    if (!imageConfig) {
      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }

    try {
      const imageBuffer = await generateImage(imageConfig.width, imageConfig.height)
      return new Response(imageBuffer as BodyInit, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': imageBuffer.length.toString(),
        },
      })
    } catch (error) {
      console.log('Error generating image', error)
      return new Response('Error generating image', { status: 500 })
    }
  }
}
