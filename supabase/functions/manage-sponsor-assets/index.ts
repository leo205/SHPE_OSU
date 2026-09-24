import { authorizeAdmin } from '../_shared/admin-auth.ts';
import { createSponsorAssetHandler } from '../_shared/sponsor-asset-handler.ts';
import { createSponsorAssetAdmin } from '../_shared/sponsor-asset-storage.ts';

Deno.serve(createSponsorAssetHandler({
  env: (name) => Deno.env.get(name),
  authorize: authorizeAdmin,
  createAdmin: createSponsorAssetAdmin,
}));
