import React from "react";
import Icon, { ContentIcon } from "./Icon.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";

export default function FavoriteShelf({ items, busyIds, onOpen, onToggle }) {
  const { locale } = useI18n();
  const english = locale === "en";
  if (!items.length) return null;
  return <section className="favorite-shelf" aria-label={english ? "Favorites" : "我的收藏"}>
    <header><span><Icon name="star" size={15}/></span><div><strong>{english ? "Favorites" : "我的收藏"}</strong><small>{english ? "Quick access in the current space" : "当前空间的快捷入口"}</small></div><em>{items.length}</em></header>
    <div className="favorite-shelf-list">
      {items.map((item,index)=><article className="favorite-shelf-item" key={item.id}>
        <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={()=>onOpen?.(item,index)} title={item.description||item.url}>
          <span><ContentIcon value={item.icon} size={20}/></span>
          <div><strong>{item.name}</strong><small>{item.category_name||(english?"Uncategorized":"未分类")}</small></div>
        </a>
        <button className="favorite-btn active" disabled={busyIds.has(item.id)} aria-label={english?"Remove favorite":"取消收藏"} title={english?"Remove favorite":"取消收藏"} onClick={()=>onToggle?.(item)}><Icon name="star" size={14}/></button>
      </article>)}
    </div>
  </section>;
}
