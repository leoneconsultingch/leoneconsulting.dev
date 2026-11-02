import config from '../../company/platform.json';
import { validatePlatformConfig } from './platform';
import { publicGuides } from './guides';

export const platform = validatePlatformConfig(config);
// Only public editorial JSON. Future premium bodies belong to a separate private store.
const modules = import.meta.glob<{ default: unknown }>('../../company/guides/*.json', { eager: true });

export function loadPublicGuides() {
  const guides = publicGuides(Object.values(modules).map(module => module.default), platform.brandId);
  return platform.features.guides ? guides : [];
}
