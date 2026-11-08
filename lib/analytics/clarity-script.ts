import { isSensitiveAnalyticsUrl } from "./url-privacy";

/** OAuth navigation gets a fresh document where the SDK is never loaded. */
export function clarityScript(projectId: string): string {
  return `(function(c,l,privateUrl,id){
    if(privateUrl(c.location.href)||privateUrl(l.referrer||""))return;
    var stopped=false;
    c.clarity=c.clarity||function(){(c.clarity.q=c.clarity.q||[]).push(arguments);};
    function stop(){
      if(stopped)return;
      stopped=true;
      try{c.clarity("stop");}catch(e){}
    }
    ["pushState","replaceState"].forEach(function(name){
      var original=c.history[name];
      c.history[name]=function(state,title,url){
        if(url!=null){
          var target;
          try{target=new URL(String(url),c.location.href);}catch(e){}
          if(target&&target.origin===new URL(c.location.href).origin&&privateUrl(target.href)){
            stop();
            c.location[name==="pushState"?"assign":"replace"](target.href);
            return;
          }
        }
        return original.apply(this,arguments);
      };
    });
    ["popstate","hashchange"].forEach(function(name){
      c.addEventListener(name,function(){
        if(privateUrl(c.location.href)){stop();c.location.reload();}
      },true);
    });
    var tag=l.createElement("script");
    tag.async=true;tag.src="https://www.clarity.ms/tag/"+id;
    var first=l.getElementsByTagName("script")[0];
    first.parentNode.insertBefore(tag,first);
  })(window,document,${isSensitiveAnalyticsUrl.toString()},${JSON.stringify(projectId)});`;
}
