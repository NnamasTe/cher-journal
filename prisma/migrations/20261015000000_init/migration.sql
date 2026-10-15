-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "capa" TEXT NOT NULL DEFAULT '/capa-padrao.png',
    "qttd_Paginas" INTEGER NOT NULL DEFAULT 0,
    "data_Criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagina" (
    "id" TEXT NOT NULL,
    "textura_Pag" TEXT NOT NULL DEFAULT 'padrao',
    "cor_Texto" TEXT NOT NULL DEFAULT '#3b2f2f',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imagens" TEXT[],
    "anotacoes" TEXT NOT NULL DEFAULT '',
    "journalId" TEXT NOT NULL,

    CONSTRAINT "Pagina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pagina_journalId_idx" ON "Pagina"("journalId");

-- AddForeignKey
ALTER TABLE "Pagina" ADD CONSTRAINT "Pagina_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
