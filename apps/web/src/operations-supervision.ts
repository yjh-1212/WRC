export const monitorStates:Record<string,string>={RUNNING:'运行中',IDLE:'临停',PARKED:'停驶',OFFLINE:'离线'};
export const fenceTypes:Record<string,string>={NO_ENTRY:'禁行区',SPEED_LIMIT:'限速区',TEMPORARY:'临时管制区',OPERATION:'历史运营区'};
export const monitorTime=(s?:string|null)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
export function ageText(ms?:number|null){return ms==null?'无上报':ms<60000?`${Math.floor(ms/1000)}秒前`:ms<3600000?`${Math.floor(ms/60000)}分钟前`:`${Math.floor(ms/3600000)}小时前`}
export const drivingMode=(s?:string)=>({AUTO:'自动驾驶',MANUAL:'人工操作',REMOTE_TAKEOVER:'远程协作',STANDBY:'待机'}as Record<string,string>)[s??'']??'—';
export function parseCoordinates(s:string){const lines=s.trim().split(/\r?\n/);if(lines.length<3)throw new Error('请先绘制至少3个有效边界点');return lines.map(line=>{const pair=line.trim().split(/[,，\s]+/).map(Number);if(pair.length!==2||pair.some(n=>!Number.isFinite(n))||Math.abs(pair[0]!)>180||Math.abs(pair[1]!)>90)throw new Error('边界坐标格式应为 经度,纬度');return {longitude:pair[0]!,latitude:pair[1]!}})}
