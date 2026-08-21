-- CreateTable
CREATE TABLE "session_renouvellement" (
    "jeton_hash" TEXT NOT NULL,
    "id_utilisateur" BIGINT NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dernier_usage_le" TIMESTAMPTZ(6),
    "revoquee_le" TIMESTAMPTZ(6),
    "agent_utilisateur" VARCHAR(300),
    "adresse_ip" INET,

    CONSTRAINT "session_renouvellement_pkey" PRIMARY KEY ("jeton_hash")
);

-- CreateIndex
CREATE INDEX "idx_session_utilisateur" ON "session_renouvellement"("id_utilisateur");

-- AddForeignKey
ALTER TABLE "session_renouvellement" ADD CONSTRAINT "session_renouvellement_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
