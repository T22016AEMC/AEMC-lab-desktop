import { SPECIES, variantOf, type SpeciesId } from '../../config/species'
import type { Box, Look } from '../look'
import { CAT_BREEDS } from './cats'
import { DOG_BREEDS } from './dogs'
import { drawQuad, quadBox, type Breed } from './quad'

export function breedOf(species: SpeciesId, variant: string | undefined): Breed {
  const v = variantOf(species, variant)
  const id = v?.id ?? SPECIES[species].variants![0].id
  return (species === 'dog' ? DOG_BREEDS : CAT_BREEDS)[id]
}

export function drawLand(ctx: CanvasRenderingContext2D, look: Look): void {
  drawQuad(ctx, look, breedOf(look.species, look.variant))
}

export function landBox(species: SpeciesId, variant: string | undefined): Box {
  return quadBox(breedOf(species, variant))
}
