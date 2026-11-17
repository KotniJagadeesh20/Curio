import zlib from 'zlib'; import fs from 'fs';
export function png(path, w, h, [r,g,b]) {
  const crc = (buf) => { let c, t = []; for (let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} let x=0xffffffff; for (const v of buf) x=t[(x^v)&0xff]^(x>>>8); return (x^0xffffffff)>>>0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2;
  const raw = Buffer.alloc((w*3+1)*h); for (let y=0;y<h;y++){ raw[y*(w*3+1)]=0; for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3; raw[o]=r; raw[o+1]=(g+x)%256; raw[o+2]=b;} }
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}
