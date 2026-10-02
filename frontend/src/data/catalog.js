// Catálogo (disciplinas, razas, campos de resultado) servido por el backend: una sola fuente
import { useEffect, useState } from 'react'
import { api } from '../api.jsx'

let cache = null
let pending = null

export function useCatalog() {
  const [cat, setCat] = useState(cache)
  useEffect(() => {
    if (cache) return
    pending = pending || api('/catalog').then((c) => { cache = c; return c })
    pending.then(setCat).catch(() => { pending = null })
  }, [])
  return cat
}

export const disciplineName = (cat, key) => cat?.disciplines.find((d) => d.key === key)?.name || key
export const breedName = (cat, key) => cat?.breeds.find((b) => b.key === key)?.name || key
