CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TentativaLogin_chave_criadoEm_idx" ON "TentativaLogin"("chave", "criadoEm");