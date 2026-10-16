#include <node_api.h>
#include <cstdint>
#include <vector>

// FNV-1a exactly matches JS Math.imul(hash ^ charCodeAt(i), 16777619)
// for each UTF-16 code unit, including surrogate pairs.
static napi_value hash_part(napi_env env, napi_callback_info info) {
  size_t argc=2;
  napi_value args[2];
  if(napi_get_cb_info(env,info,&argc,args,nullptr,nullptr)!=napi_ok)
    return nullptr;
  if(argc!=2) {
    napi_throw_type_error(env,nullptr,"hashPart needs uint32 seed and UTF-16 text");
    return nullptr;
  }
  uint32_t hash;
  if(napi_get_value_uint32(env,args[0],&hash)!=napi_ok)
    return nullptr;
  size_t length=0;
  if(napi_get_value_string_utf16(env,args[1],nullptr,0,&length)!=napi_ok)
    return nullptr;
  std::vector<char16_t> buffer(length+1);
  if(napi_get_value_string_utf16(env,args[1],buffer.data(),
      buffer.size(),&length)!=napi_ok)
    return nullptr;
  for(size_t i=0;i<length;i++)
    hash=(hash^static_cast<uint16_t>(buffer[i]))*16777619u;
  napi_value result;
  if(napi_create_uint32(env,hash,&result)!=napi_ok)return nullptr;
  return result;
}
static napi_value initialize(napi_env env,napi_value exports) {
  napi_property_descriptor descriptor={
    "hashPart",nullptr,hash_part,nullptr,nullptr,nullptr,napi_default,nullptr
  };
  if(napi_define_properties(env,exports,1,&descriptor)!=napi_ok)
    return nullptr;
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,initialize)
