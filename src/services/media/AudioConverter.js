import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Readable, Writable } from 'stream';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class AudioConverter {
  /**
   * Convert audio buffer to specified format
   * @param {Buffer} inputBuffer 
   * @param {string} outputFormat (e.g., 'ogg', 'mp3')
   * @returns {Promise<Buffer>}
   */
  static async convert(inputBuffer, outputFormat = 'ogg') {
    return new Promise((resolve, reject) => {
      // Create readable stream from input buffer
      const inputStream = new Readable();
      inputStream.push(inputBuffer);
      inputStream.push(null);

      // Collect output chunks
      const chunks = [];
      const outputStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      let command = ffmpeg(inputStream)
        .toFormat(outputFormat);

      // Specific settings for WhatsApp OGG (Opus)
      if (outputFormat === 'ogg') {
        command
          .audioCodec('libopus')
          .audioBitrate('64k'); // Good balance for voice
      }

      command
        .on('error', (err) => {
          console.error('❌ Audio conversion failed:', err);
          reject(err);
        })
        .on('end', () => {
          const outputBuffer = Buffer.concat(chunks);
          resolve(outputBuffer);
        })
        .pipe(outputStream, { end: true });
    });
  }
}
