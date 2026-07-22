import { useEffect, useState } from 'react'
import { getPhoto } from '../lib/photos'

/** IndexedDB 照片縮圖，點開看大圖。 */
export default function PhotoThumb({ photoId, size = 64 }: { photoId: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    let objUrl: string | null = null
    void getPhoto(photoId).then((blob) => {
      if (alive && blob) {
        objUrl = URL.createObjectURL(blob)
        setUrl(objUrl)
      }
    })
    return () => {
      alive = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [photoId])

  if (!url) return <div style={{ width: size, height: size, borderRadius: 8, background: 'var(--panel-2)' }} />

  return (
    <>
      <img
        src={url}
        alt="餐點照片"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
        onClick={() => setOpen(true)}
        data-testid="photo-thumb"
      />
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <img src={url} alt="餐點照片" style={{ maxWidth: '95vw', maxHeight: '85dvh', borderRadius: 12 }} />
        </div>
      )}
    </>
  )
}
