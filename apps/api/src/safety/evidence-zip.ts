// A small standard ZIP (stored entries, UTF-8 names). No external media is fetched.
const table = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(b:Buffer){let c=0xffffffff;for(const n of b)c=table[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function evidenceZip(files:{name:string;buffer:Buffer}[]) {
  const data:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  for(const file of files){const name=Buffer.from(file.name),crc=crc32(file.buffer),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(file.buffer.length,18);local.writeUInt32LE(file.buffer.length,22);local.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(file.buffer.length,20);central.writeUInt32LE(file.buffer.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    data.push(local,name,file.buffer);directory.push(central,name);offset+=local.length+name.length+file.buffer.length;
  }
  const end=Buffer.alloc(22),size=directory.reduce((n,b)=>n+b.length,0);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);return Buffer.concat([...data,...directory,end]);
}
