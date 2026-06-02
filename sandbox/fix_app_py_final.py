import sys
path = 'src/tidal_dl_ru/server/app.py'

replacement = """
            if res["type"] == "redirect":
                # We must proxy the stream to bypass CORS for Web Audio API (AudioContext)
                req_headers = {}
                if "range" in request.headers:
                    req_headers["range"] = request.headers["range"]
                
                client = httpx.AsyncClient()
                r = await client.send(client.build_request("GET", res["url"], headers=req_headers), stream=True)
                
                # Pass through response headers, but remove hop-by-hop and encoding headers
                headers = dict(r.headers)
                for k in ["content-encoding", "transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "upgrade"]:
                    headers.pop(k, None)
                    
                headers["Accept-Ranges"] = "bytes"
                headers["Access-Control-Allow-Origin"] = "*"
                headers["Access-Control-Expose-Headers"] = "X-Actual-Quality"
                if "actual_quality" in res:
                    headers["X-Actual-Quality"] = res["actual_quality"]
                
                async def _stream_generator():
                    async for chunk in r.aiter_bytes(chunk_size=65536):
                        yield chunk
                    await client.aclose()
                    
                return StreamingResponse(
                    _stream_generator(), 
                    status_code=r.status_code, 
                    headers=headers,
                    media_type=headers.get("content-type", "audio/mp4")
                )
                
            elif res["type"] == "dash_stream":
                from tidal_dl_ru.providers.tidal.download import _decode_manifest, _stream_urls_from_dash, extension_for
                decoded = _decode_manifest(res["manifest"])
                urls, codecs = _stream_urls_from_dash(decoded)
                
                ext = extension_for(codecs, res["manifest"].manifest_mime_type)
                final_path = cache_dir / f"{track_id}_{quality.upper()}{ext}"
                
                if not final_path.exists():
                    import asyncio
                    import httpx
                    
                    async def fetch_segment(client, url, idx):
                        resp = await client.get(url)
                        resp.raise_for_status()
                        return idx, resp.content
                        
                    async with httpx.AsyncClient() as async_client:
                        sem = asyncio.Semaphore(15)
                        async def bounded_fetch(idx, u):
                            async with sem:
                                return await fetch_segment(async_client, u, idx)
                                
                        tasks = [bounded_fetch(i, u) for i, u in enumerate(urls)]
                        results = await asyncio.gather(*tasks)
                        
                        results.sort(key=lambda x: x[0])
                        def write_file():
                            with open(final_path, 'wb') as f:
                                for _, chunk in results:
                                    f.write(chunk)
                        await asyncio.to_thread(write_file)
                        
                media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                hdrs = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Actual-Quality"}
                if "actual_quality" in res:
                    hdrs["X-Actual-Quality"] = res["actual_quality"]
                return FileResponse(final_path, headers=hdrs, media_type=media_type)
                
            media_type = "audio/flac" if str(res["path"]).endswith(".flac") else "audio/mp4"
            hdrs = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Actual-Quality"}
            if "actual_quality" in res:
                hdrs["X-Actual-Quality"] = res["actual_quality"]
            return FileResponse(res["path"], headers=hdrs, media_type=media_type)
        except Exception as e:
            print(f"Streaming error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
"""

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('            if res["type"] == "redirect":')
end_idx = text.find('            raise HTTPException(status_code=500, detail=str(e))') + len('            raise HTTPException(status_code=500, detail=str(e))')

if start_idx == -1 or end_idx == -1:
    print('Could not find boundaries')
    sys.exit(1)

new_text = text[:start_idx] + replacement.lstrip('\n') + text[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_text)
print('Done.')
