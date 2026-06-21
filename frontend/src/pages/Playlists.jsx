import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Jun18: /playlists redirects into Library playlists tab. */
export default function Playlists() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/library?tab=playlists', { replace: true });
  }, [navigate]);
  return null;
}
