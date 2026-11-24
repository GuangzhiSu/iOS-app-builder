import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const signingKeys=['IOS_P12_BASE64','IOS_P12_PASSWORD','IOS_PROFILE_BASE64','ASC_KEY_BASE64','ASC_KEY_ID','ASC_ISSUER_ID'];
export function signingReadiness(env) {
  const missing=signingKeys.filter(k=>!env[k]?.trim());
  const invalid=[];
  for(const k of ['IOS_P12_BASE64','IOS_PROFILE_BASE64','ASC_KEY_BASE64'])if(env[k]&&!/^[A-Za-z0-9+/]+={0,2}$/.test(env[k].trim()))invalid.push(k);
  if(env.ASC_KEY_ID&&!/^[A-Za-z0-9]{5,30}$/.test(env.ASC_KEY_ID))invalid.push('ASC_KEY_ID');
  if(env.ASC_ISSUER_ID&&!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(env.ASC_ISSUER_ID))invalid.push('ASC_ISSUER_ID');
  return {ready:!missing.length&&!invalid.length,missing,invalid,note:'只检查配置存在与格式；真实证书、会员和 Apple 上传仍需后续验证。'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=signingReadiness(process.env);
  const summary='## TestFlight configuration\n\n'+(result.ready?'Required settings are present. Actual signing has not been verified.':'Missing settings: '+result.missing.join(', ')+'\n\nInvalid formats: '+result.invalid.join(', '))+'\n\nSee TESTFLIGHT.md. No secret values are included.\n';
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary,{flag:'a'});
  console.log(JSON.stringify(result));
  if(!result.ready)process.exitCode=1;
}
