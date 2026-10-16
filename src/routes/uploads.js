const express = require('express');
const { put } = require('@vercel/blob');

const router = express.Router();

const TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function pareceImagem(buf, tipo) {
  if (tipo === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (tipo === 'image/png') {
    return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (tipo === 'image/webp') {
    return buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  }
  return false;
}

function receberImagem(pasta) {
  return [
    express.raw({ type: Object.keys(TIPOS), limit: '4mb' }),
    async (req, res, next) => {
      try {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(500).json({ erro: 'O armazenamento de imagens ainda não foi configurado.' });
        }

        const tipo = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const extensao = TIPOS[tipo];
        if (!extensao || !Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ erro: 'Envie uma imagem JPEG, PNG ou WebP.' });
        }
        if (!pareceImagem(req.body, tipo)) {
          return res.status(400).json({ erro: 'O arquivo não parece ser uma imagem válida.' });
        }

        // O arquivo é guardado exatamente como chegou (sem reprocessar),
        // então a transparência dos PNGs é preservada.
        const blob = await put(`${pasta}/${pasta.slice(0, -1)}.${extensao}`, req.body, {
          access: 'public',
          addRandomSuffix: true,
          contentType: tipo,
        });
        return res.status(201).json({ url: blob.url });
      } catch (erro) {
        return next(erro);
      }
    },
  ];
}

router.post('/uploads/capa', ...receberImagem('capas'));
router.post('/uploads/adesivo', ...receberImagem('adesivos'));

module.exports = router;
