import { useEffect, useRef, type RefObject } from 'react'
import type { MapDefinition, MapFrame } from './mapTypes'
import { cachedMapImage, croppedTile, dollLayers, drawDreamsGate, drawDue, markerStyle, prepareMap, visibleTiles, type MapRenderBuffer, type PreparedPlacement } from './mapRendering'

/** Console: map-canvas.tsx. The 2D canvas renderer for
 *  a map definition plus the buffered live frame (terrain, layered
 *  entities with interpolation, target-queue markers, HP/MP bars, names and
 *  hit/heal floaters when detailed, farming-area overlay and pins). */
export function MapCanvas({
  definition,
  frame,
  previous,
  receivedAt,
  scale,
  detailed,
  area,
  huntRadius,
  buffer,
  fps,
  active = true,
  fullMap = false,
  pins = [],
  onWaypoint,
}: {
  definition: MapDefinition | null;
  frame: MapFrame | null;
  previous: MapFrame | null;
  receivedAt: number;
  scale: number;
  detailed: boolean;
  area?: { x: number; y: number; boundary?: number[] | null };
  huntRadius?: number;
  buffer?: RefObject<MapRenderBuffer>;
  fps?: number;
  active?: boolean;
  fullMap?: boolean;
  pins?: {x:number;y:number;label:string;color:string}[];
  onWaypoint?: (point:{x:number;y:number}) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useRef({left:0,top:0,scale:1});
  const propsRef = useRef({
    definition,
    frame,
    previous,
    receivedAt,
    scale,
    detailed,
    area,
    huntRadius,
    fullMap, pins,
  });
  useEffect(() => {
    propsRef.current = {
      definition,
      frame,
      previous,
      receivedAt,
      scale,
      detailed,
      area,
      huntRadius,
      fullMap, pins,
    };
  }, [definition, frame, previous, receivedAt, scale, detailed, area, huntRadius, fullMap, pins]);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    const resize = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) rect = { width: box.width, height: box.height };
    });
    resize.observe(canvas);
    let animation = 0, lastDraw = -Infinity;
    let preparedDefinition: MapDefinition | null = null;
    let prepared: ReturnType<typeof prepareMap> | null = null;
    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (!drawDue(now, lastDraw, fps)) return;
      lastDraw = now;
      const canvas = canvasRef.current;
      const p = { ...propsRef.current, ...buffer?.current };
      if (!canvas) return;
      if (!p.definition || !p.frame || p.definition.name !== p.frame.map) {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (preparedDefinition !== p.definition) {
        preparedDefinition = p.definition;
        prepared = prepareMap(p.definition);
      }
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * ratio)),
        height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Outdoor maps use water as their default/background tile. Paint that
      // directly in screen space first so no camera transform, map bound, or
      // placement gap can ever expose black void around an island or beach.
      const defaultDefinition = Number.isInteger(p.definition.default)
        ? p.definition.tiles[p.definition.default as number]
        : null;
      ctx.fillStyle = defaultDefinition?.[0] === "water" ? "#2d7fb3" : "#07110f";
      ctx.fillRect(0, 0, rect.width, rect.height);
      if (defaultDefinition) {
        const [set, sx, sy, tw, rawHeight] = defaultDefinition,
          th = rawHeight || tw;
        const url = p.definition.tilesets[set]?.file || "",
          image = cachedMapImage(url);
        if (image?.complete && image.naturalWidth) {
          const background = ctx.createPattern(croppedTile(image, url, sx, sy, tw, th), "repeat");
          if (background) {
            if (typeof background.setTransform === "function")
              background.setTransform(new DOMMatrix().scale(p.scale));
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, rect.width, rect.height);
          }
        }
      }
      const alpha = Math.min(1, Math.max(0, (performance.now() - p.receivedAt) / 100));
      const old = p.previous && p.previous.map === p.frame.map ? p.previous : p.frame;
      if (p.fullMap) p.scale = Math.min(rect.width/(p.definition.max_x-p.definition.min_x+100),rect.height/(p.definition.max_y-p.definition.min_y+100));
      const cameraX = p.fullMap ? (p.definition.min_x+p.definition.max_x)/2 : old.x + (p.frame.x - old.x) * alpha;
      const cameraY = p.fullMap ? (p.definition.min_y+p.definition.max_y)/2 : old.y + (p.frame.y - old.y) * alpha;
      const left = cameraX - rect.width / (2 * p.scale),
        top = cameraY - rect.height / (2 * p.scale);
      viewport.current = {left,top,scale:p.scale};
      ctx.save();
      ctx.scale(p.scale, p.scale);
      ctx.translate(-left, -top);
      const drawPlacement = (prepared: PreparedPlacement) => {
        const range = visibleTiles(prepared, left, top, left + rect.width / p.scale, top + rect.height / p.scale);
        if (!range) return;
        const { placement } = prepared;
        const tile = p.definition!.tiles[placement[0]];
        if (!tile) return;
        const [set, sx, sy, tw, rawHeight] = tile,
          th = rawHeight || tw;
        const image = cachedMapImage(p.definition!.tilesets[set]?.file || "");
        if (!image?.complete || !image.naturalWidth) return;
        for (let y = range.top; y <= range.bottom; y += th)
          for (let x = range.left; x <= range.right; x += tw)
            ctx.drawImage(image, sx, sy, tw, th, x, y, tw + 0.35 / p.scale, th + 0.35 / p.scale);
      };
      if (Number.isInteger(p.definition.default)) {
        const tile = p.definition.tiles[p.definition.default as number];
        if (tile) {
          const [set, sx, sy, tw, rawHeight] = tile,
            th = rawHeight || tw;
          const image = cachedMapImage(p.definition.tilesets[set]?.file || "");
          if (image?.complete && image.naturalWidth) {
            const viewRight = left + rect.width / p.scale,
              viewBottom = top + rect.height / p.scale;
            const pattern = ctx.createPattern(
              croppedTile(image, p.definition.tilesets[set].file, sx, sy, tw, th),
              "repeat",
            );
            if (pattern) {
              ctx.fillStyle = pattern;
              ctx.fillRect(
                left - tw * 2,
                top - th * 2,
                viewRight - left + tw * 4,
                viewBottom - top + th * 4,
              );
            }
          }
        }
      }
      prepared!.placements.forEach(drawPlacement);
      const layers: { y: number; draw: () => void }[] = [];
      p.definition.decorations?.forEach(decoration => layers.push({ y: decoration.y, draw: () => {
        ctx.save(); ctx.translate(decoration.x, decoration.y);
        drawDreamsGate(ctx, p.definition!.tilesets, Date.now()); ctx.restore();
      } }));
      prepared!.groups.forEach(group => layers.push({ y: group.y, draw: () => group.placements.forEach(drawPlacement) }));
      const priorEntities = new Map((old.entities || []).map((entity) => [entity.id, entity]));
      p.frame.entities.forEach((entity) => {
        const prior = priorEntities.get(entity.id) || entity;
        const x = prior.x + (entity.x - prior.x) * alpha,
          y = prior.y + (entity.y - prior.y) * alpha;
        layers.push({
          y,
          draw: () => {
            const targeted = p.frame!.target === entity.id;
            const threatening = entity.target === p.frame!.name;
            const eventMarker=p.frame!.eventCombat || (p.frame!.queue||[]).some(t=>t.state==='event'||t.state==='scatter');
            const rank=p.frame!.grouped || eventMarker ? (p.frame!.queue||[]).findIndex(t=>t.id===entity.id&&t.map===p.frame!.map&&t.visible!==false) : -1;
            if (rank>=0 || !p.frame!.grouped && !eventMarker && (targeted || threatening)) {
              const style=rank>=0 ? markerStyle(p.frame!.queue![rank],rank) : {css:"#ef4444",double:false};
              ctx.strokeStyle = style.css;
              ctx.lineWidth = 3 / p.scale;
              ctx.beginPath();
              const radius=rank>=0 ? p.frame!.queue![rank].radius||18 : 18;
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              if(style.double){ctx.moveTo(x+radius+6/p.scale,y);ctx.arc(x,y,radius+6/p.scale,0,Math.PI*2);}
              ctx.stroke();
            }
            const recentAttack = (p.frame!.events || [])
              .slice()
              .reverse()
              .find(
                (event) =>
                  event.kind === "action" &&
                  String(event.data.actor || event.data.attacker || "") === entity.id &&
                  Date.now() - event.at < 220,
              );
            const attackAge = recentAttack ? Date.now() - recentAttack.at : 999;
            const attackTarget =
              recentAttack &&
              p.frame!.entities.find(
                (candidate) => candidate.id === String(recentAttack.data.target || ""),
              );
            const attackAmount =
              attackAge < 120
                ? (1 - attackAge / 120) * 7
                : attackAge < 220
                  ? ((attackAge - 120) / 100) * 3
                  : 0;
            const attackLength = attackTarget
              ? Math.hypot(attackTarget.x - x, attackTarget.y - y) || 1
              : 1;
            const drawX =
              x + (attackTarget ? ((attackTarget.x - x) / attackLength) * attackAmount : 0);
            const drawY =
              y + (attackTarget ? ((attackTarget.y - y) / attackLength) * attackAmount : 0);
            let drewDoll = false;
            if (entity.dollHtml) {
              const layers = dollLayers(entity.dollHtml),
                outerLeft = drawX - 13.5,
                outerTop = drawY - 38;
              layers.forEach((layer) => {
                const image = cachedMapImage(layer.url);
                if (!image?.complete || !image.naturalWidth) return;
                const clipX = outerLeft + layer.left,
                  clipY = outerTop + 38 - layer.bottom - layer.height;
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, clipY, layer.width, layer.height);
                ctx.clip();
                ctx.drawImage(
                  image,
                  clipX + layer.marginLeft,
                  clipY + layer.marginTop,
                  layer.imageWidth,
                  layer.imageHeight,
                );
                ctx.restore();
                drewDoll = true;
              });
            }
            const sprite = entity.sprite,
              image = sprite && cachedMapImage(sprite.url);
            if (!drewDoll) {
              if (sprite && image?.complete && image.naturalWidth) {
                const sw = image.naturalWidth / sprite.columns,
                  sh = image.naturalHeight / sprite.rows;
                const dw = sw / Math.max(1, sprite.tileSize),
                  dh = sh / Math.max(1, sprite.tileSize);
                const walkFrame = entity.moving ? (Math.floor(Date.now() / 160) % 2 ? -1 : 1) : 0;
                const sourceX = Math.max(0, Math.min(sprite.columns - 1, sprite.x + walkFrame));
                const sourceY = Math.max(
                  0,
                  Math.min(sprite.rows - 1, sprite.y + (entity.direction || 0)),
                );
                // Atlas cells touch one another. Cropping half a source pixel on
                // every edge prevents the adjacent row/column from flashing when
                // a moving sprite changes frame at a fractional canvas scale.
                const inset = 0.5;
                const snappedX = Math.round(drawX * p.scale * ratio) / (p.scale * ratio);
                const snappedY = Math.round(drawY * p.scale * ratio) / (p.scale * ratio);
                ctx.drawImage(
                  image,
                  sourceX * sw + inset,
                  sourceY * sh + inset,
                  sw - inset * 2,
                  sh - inset * 2,
                  snappedX - dw / 2 + inset,
                  snappedY - dh + inset,
                  dw - inset * 2,
                  dh - inset * 2,
                );
              } else {
                ctx.fillStyle =
                  entity.type === "monster"
                    ? "#fb7185"
                    : entity.type === "npc"
                      ? "#facc15"
                      : "#5eead4";
                ctx.fillRect(x - 4, y - 8, 8, 8);
              }
            }
            for (const weapon of entity.weapons || []) {
              const sprite = weapon.sprite, image = sprite && cachedMapImage(sprite.url);
              if (!sprite || !image?.complete || !image.naturalWidth) continue;
              const sw = image.naturalWidth/sprite.columns, sh = image.naturalHeight/sprite.rows;
              ctx.save();
              ctx.translate(drawX+(weapon.hand==='offhand'?6:-6),drawY-5);
              if(weapon.hand==='offhand')ctx.scale(-1,1);
              ctx.drawImage(image,sprite.x*sw+.5,sprite.y*sh+.5,sw-1,sh-1,-8,-16,16,16);
              ctx.restore();
            }
            if (entity.stand && entity.standSprite) {
              const stand = entity.standSprite,
                standImage = cachedMapImage(stand.url);
              if (standImage?.complete && standImage.naturalWidth) {
                const sw = standImage.naturalWidth / stand.columns,
                  sh = standImage.naturalHeight / stand.rows;
                // Anchor the official stand texture at the merchant's feet.
                const standScale = 1;
                ctx.drawImage(
                  standImage,
                  stand.x * sw + 0.5,
                  stand.y * sh + 0.5,
                  sw - 1,
                  sh - 1,
                  drawX - (sw * standScale) / 2,
                  drawY + 3 - sh * standScale,
                  sw * standScale,
                  sh * standScale,
                );
              }
            }
            if (entity.type === "character") {
              const barW = p.detailed ? 42 : 30,
                barY = y - 47;
              ctx.fillStyle = "#1f1515";
              ctx.fillRect(x - barW / 2, barY, barW, 4);
              ctx.fillStyle = "#ef4444";
              ctx.fillRect(
                x - barW / 2,
                barY,
                barW * Math.max(0, Math.min(1, entity.hp / (entity.max_hp || 1))),
                4,
              );
              ctx.fillStyle = "#111827";
              ctx.fillRect(x - barW / 2, barY + 5, barW, 3);
              ctx.fillStyle = "#3b82f6";
              ctx.fillRect(
                x - barW / 2,
                barY + 5,
                barW * Math.max(0, Math.min(1, entity.mp / (entity.max_mp || 1))),
                3,
              );
            }
            if (targeted && entity.type === "monster") {
              const barW = p.detailed ? 52 : 36,
                barY = y - 40;
              ctx.fillStyle = "#260d12";
              ctx.fillRect(x - barW / 2, barY, barW, p.detailed ? 6 : 4);
              ctx.fillStyle = "#f43f5e";
              ctx.fillRect(
                x - barW / 2,
                barY,
                barW * Math.max(0, Math.min(1, entity.hp / (entity.max_hp || 1))),
                p.detailed ? 6 : 4,
              );
            }
            if (p.detailed && entity.type !== "monster") {
              ctx.font = "11px monospace";
              ctx.textAlign = "center";
              ctx.fillStyle = "#ecfdf5";
              ctx.strokeStyle = "#020807";
              ctx.lineWidth = 3;
              ctx.strokeText(entity.name, x, y + 14);
              ctx.fillText(entity.name, x, y + 14);
            }
          },
        });
      });
      layers.sort((a, b) => a.y - b.y).forEach((layer) => layer.draw());
      // The game's normal camera never exposes space beyond GEO bounds, and
      // some maps include black boundary artwork there. Our centered minimap
      // can see farther than the game camera, so deliberately replace every
      // out-of-world region with the map's default tile after terrain layers
      // have rendered. For mainland-style maps, this means ocean forever.
      if (defaultDefinition?.[0] === "water") {
        const [set, sx, sy, tw, rawHeight] = defaultDefinition,
          th = rawHeight || tw;
        const url = p.definition.tilesets[set]?.file || "",
          waterImage = cachedMapImage(url);
        if (waterImage?.complete && waterImage.naturalWidth) {
          const water = ctx.createPattern(croppedTile(waterImage, url, sx, sy, tw, th), "repeat");
          if (water) {
            ctx.fillStyle = water;
            const right = left + rect.width / p.scale,
              bottom = top + rect.height / p.scale;
            const edge = 1 / p.scale;
            if (left < p.definition.min_x + edge)
              ctx.fillRect(
                left - tw,
                top - th,
                p.definition.min_x - left + edge + tw,
                bottom - top + th * 2,
              );
            if (right > p.definition.max_x - edge)
              ctx.fillRect(
                p.definition.max_x - edge,
                top - th,
                right - p.definition.max_x + edge + tw,
                bottom - top + th * 2,
              );
            if (top < p.definition.min_y + edge)
              ctx.fillRect(
                left - tw,
                top - th,
                right - left + tw * 2,
                p.definition.min_y - top + edge + th,
              );
            if (bottom > p.definition.max_y - edge)
              ctx.fillRect(
                left - tw,
                p.definition.max_y - edge,
                right - left + tw * 2,
                bottom - p.definition.max_y + edge + th,
              );
          }
        }
      }
      if (p.detailed)
        (p.frame.events || []).forEach((event) => {
          const age = Date.now() - event.at;
          if (age > 1100) return;
          const data = event.data,
            target = p.frame!.entities.find(
              (entity) => entity.id === String(data.target || data.id || ""),
            );
          if (!target) return;
          const fade = 1 - age / 1100;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = event.kind === "hit" ? "#fbbf24" : "#a78bfa";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(target.x, target.y - 12, 8 + age / 35, 0, Math.PI * 2);
          ctx.stroke();
          const amount = data.damage || data.heal;
          if (amount) {
            ctx.fillStyle = data.heal ? "#4ade80" : "#f87171";
            ctx.font = "bold 13px monospace";
            ctx.textAlign = "center";
            ctx.fillText(String(amount), target.x, target.y - 35 - age / 30);
          }
          ctx.globalAlpha = 1;
        });
      if (p.area) {
        if (p.area.boundary) {
          const [x1, y1, x2, y2] = p.area.boundary;
          ctx.fillStyle = "rgba(34,211,238,0.22)";
          ctx.strokeStyle = "#67e8f9";
          ctx.lineWidth = 2 / p.scale;
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        }
        ctx.strokeStyle = "#fcd34d";
        ctx.lineWidth = 2 / p.scale;
        ctx.setLineDash([6 / p.scale, 4 / p.scale]);
        ctx.beginPath();
        ctx.arc(p.area.x, p.area.y, p.huntRadius || 400, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.area.x, p.area.y, 5 / p.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      const labels: {left:number;right:number;top:number;bottom:number}[] = [];
      for (const pin of p.pins) {
        ctx.fillStyle = pin.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2/p.scale;
        ctx.beginPath(); ctx.arc(pin.x,pin.y,6/p.scale,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.font = `${12/p.scale}px sans-serif`; ctx.textAlign='center';
        const half=ctx.measureText(pin.label).width/2;
        let y=pin.y-10/p.scale;
        for(let attempt=0;attempt<8;attempt++) {
          if(!labels.some(box=>pin.x+half>box.left&&pin.x-half<box.right&&y>box.top&&y-14/p.scale<box.bottom))break;
          y-=15/p.scale;
        }
        labels.push({left:pin.x-half,right:pin.x+half,top:y-14/p.scale,bottom:y});
        ctx.strokeText(pin.label,pin.x,y); ctx.fillText(pin.label,pin.x,y);
      }
      ctx.restore();
    };
    animation = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animation); resize.disconnect(); };
  }, [active, buffer, fps]);
  return <canvas ref={canvasRef} className="block h-full w-full" onClick={event => {
    if (!onWaypoint) return;
    const rect = event.currentTarget.getBoundingClientRect(), v = viewport.current;
    onWaypoint({x:v.left+(event.clientX-rect.left)/v.scale,y:v.top+(event.clientY-rect.top)/v.scale});
  }} />;
}
