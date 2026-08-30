-- DropForeignKey
ALTER TABLE "employe" DROP CONSTRAINT "employe_code_departement_fkey";

-- DropForeignKey
ALTER TABLE "localite" DROP CONSTRAINT "localite_code_pays_fkey";

-- DropForeignKey
ALTER TABLE "localite" DROP CONSTRAINT "localite_cree_par_fkey";

-- DropForeignKey
ALTER TABLE "localite" DROP CONSTRAINT "localite_retire_par_fkey";

-- AddForeignKey
ALTER TABLE "localite" ADD CONSTRAINT "localite_code_pays_fkey" FOREIGN KEY ("code_pays") REFERENCES "pays"("code_iso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localite" ADD CONSTRAINT "localite_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localite" ADD CONSTRAINT "localite_retire_par_fkey" FOREIGN KEY ("retire_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employe" ADD CONSTRAINT "employe_code_departement_fkey" FOREIGN KEY ("code_departement") REFERENCES "departement"("code") ON DELETE SET NULL ON UPDATE CASCADE;
