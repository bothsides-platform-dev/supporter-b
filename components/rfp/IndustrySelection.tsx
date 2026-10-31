"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  House,
  Monitor,
  Plane,
  Search,
  Shapes,
  Shirt,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { publicInputClass } from "@/components/forms/inputs";
import { Button } from "@/components/primitives/Button";
import { FieldError } from "@/components/primitives/FieldError";
import { useRfpDraft } from "@/lib/stores/rfp-draft-context";
import { isIndustrySelectionValid } from "@/lib/rfp/industry-selection";
import {
  INDUSTRY_CATEGORIES,
  industryDisplay,
  searchIndustries,
} from "@/lib/rfp/industry-display";
import type { PublicIndustry } from "@/lib/types/pg-recommendation";
import styles from "./IndustrySelection.module.css";

export const INDUSTRY_SELECTION_GUIDANCE =
  "판매하는 상품이나 서비스와 가장 가까운 업종 하나를 골라요.";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "식품과 음식점": Utensils,
  "패션과 뷰티": Shirt,
  "생활용품과 가전, 반려동물": House,
  "책과 문구, 취미용품": BookOpen,
  "디지털 서비스": Monitor,
  "교육과 전문 서비스": GraduationCap,
  "여행과 숙박, 여가": Plane,
  "기타 업종": Shapes,
};

function IndustryCategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Shapes;
  return (
    <Icon
      size={22}
      strokeWidth={1.5}
      aria-hidden="true"
      className={styles.categoryIcon}
    />
  );
}

export function IndustrySelection({
  groups,
  attempted = false,
  showGuidance = true,
  presentation = "default",
}: {
  groups: PublicIndustry[];
  attempted?: boolean;
  showGuidance?: boolean;
  presentation?: "default" | "public";
}) {
  const isPublic = presentation === "public";
  const draft = useRfpDraft();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const categoryHeading = useRef<HTMLHeadingElement>(null);
  const categoryButtons = useRef(new Map<string, HTMLButtonElement>());
  const categoryFocusRequested = useRef<string | null>(null);
  const focusCustomNameRequested = useRef(false);
  const customNameInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const custom = draft.industryMode === "custom" || groups.length === 0;
  const [category, setCategory] = useState<string | null>(() => {
    const selected = groups.find((group) => group.id === draft.industryGroupId);
    return selected && draft.industryMode !== "custom"
      ? industryDisplay(selected).category
      : null;
  });
  const searching = query.trim().length > 0;
  useEffect(() => {
    const requested = categoryFocusRequested.current;
    if (!requested) return;
    if (category) categoryHeading.current?.focus();
    else categoryButtons.current.get(requested)?.focus();
    categoryFocusRequested.current = null;
  }, [category]);
  useEffect(() => {
    if (!custom || !focusCustomNameRequested.current) return;
    customNameInput.current?.focus();
    focusCustomNameRequested.current = false;
  }, [custom]);
  const matches = useMemo(
    () => (searching ? searchIndustries(groups, query) : []),
    [searching, groups, query],
  );
  const results = searching
    ? matches.map((match) => match.group)
    : groups.filter((group) => industryDisplay(group).category === category);
  // 가장 가까운 결과가 자모 오타로 맞은 경우만 안내한다 — 초성·한/영 전환·띄어쓰기로 찾은 결과는 사용자가 의도한 검색이다.
  const onlySimilar = matches.length > 0 && matches[0].typo;
  const categories = INDUSTRY_CATEGORIES.filter((category) =>
    groups.some((group) => industryDisplay(group).category === category),
  );
  const selectCustom = () => {
    focusCustomNameRequested.current = true;
    draft.setField("industryMode", "custom");
    // 검색어가 글자 그대로 들어 있거나 결과가 없을 때만 가져온다 — 오타·한/영 전환·초성·조합 중인 검색어가 업종 이름이
    // 되면 등록 업종 정책을 비켜간다(여성뷱·dutjdqhr·ㅇㄹ·여성보).
    const queryIsName =
      matches.length === 0 || matches.some((match) => match.exact);
    if (!draft.customIndustryName && queryIsName)
      draft.setField("customIndustryName", query.trim().slice(0, 100));
  };
  const error = attempted && !isIndustrySelectionValid(draft, groups);
  const selected = custom
    ? draft.customIndustryName.trim()
    : (() => {
        const group = groups.find((g) => g.id === draft.industryGroupId);
        return group ? industryDisplay(group).displayName : "";
      })();
  return (
    <div className={styles.root}>
      {showGuidance && (
        <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
          {INDUSTRY_SELECTION_GUIDANCE}
        </p>
      )}
      {groups.length > 0 && (
        <>
          <div className={styles.search}>
            <label htmlFor={`${id}-search`} className="sr-only">
              업종 검색
            </label>
            <Search
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
              className={styles.searchIcon}
            />
            <Input
              ref={searchInput}
              className={`${isPublic ? publicInputClass : ""} ${styles.searchInput}`}
              id={`${id}-search`}
              type="search"
              placeholder="상품이나 서비스로 검색해요"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <Button
                type="button"
                variant="text"
                aria-label="검색 초기화"
                className={styles.clearSearch}
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <X size={18} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            )}
          </div>
        </>
      )}
      <fieldset className={styles.options}>
        <legend className="sr-only">업종</legend>
        {!searching && !category && categories.length > 0 && (
          <>
            <p className={styles.sectionLabel}>카테고리로 찾아요</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((item) => (
                <Button
                  key={item}
                  ref={(node) => {
                    if (node) categoryButtons.current.set(item, node);
                    else categoryButtons.current.delete(item);
                  }}
                  type="button"
                  className={styles.category}
                  variant="text"
                  onClick={() => {
                    categoryFocusRequested.current = item;
                    setCategory(item);
                  }}
                >
                  <IndustryCategoryIcon category={item} />
                  <span className={styles.categoryLabel}>{item}</span>
                  <ChevronRight
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                  />
                </Button>
              ))}
            </div>
          </>
        )}
        {!searching && category && (
          <div className={styles.categoryHeader}>
            <Button
              type="button"
              variant="text"
              aria-label="전체 카테고리"
              className={styles.back}
              onClick={() => {
                categoryFocusRequested.current = category;
                setCategory(null);
              }}
            >
              <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
              전체
            </Button>
            <h3
              ref={categoryHeading}
              tabIndex={-1}
              className={styles.categoryTitle}
            >
              <IndustryCategoryIcon category={category} />
              <span>{category}</span>
            </h3>
          </div>
        )}
        {searching && (
          <p className={styles.sectionLabel}>
            검색 결과 <span className="md-numeric">{results.length}</span>개
          </p>
        )}
        {searching && results.length === 0 && (
          <p role="status" className={styles.sectionLabel}>
            검색 결과가 없어요. 검색어를 지우거나 아래에서 업종을 직접 입력해요.
          </p>
        )}
        {onlySimilar && (
          <p role="status" className={styles.sectionLabel}>
            검색어와 비슷한 업종을 찾았어요. 아래에서 맞는 업종을 골라요.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {results.map((group) => {
            const display = industryDisplay(group);
            return (
              <label key={group.id} className={styles.choice}>
                <input
                  type="radio"
                  name={`${id}-industry`}
                  checked={!custom && draft.industryGroupId === group.id}
                  onChange={() => {
                    draft.setField("industryMode", "registered");
                    draft.setField("industryGroupId", group.id);
                    setCategory(industryDisplay(group).category);
                  }}
                  className="sr-only"
                />
                <span className={styles.choiceText}>
                  {display.displayName}
                  {display.examples && (
                    <span className={styles.examples}>{display.examples}</span>
                  )}
                </span>
                <span className={styles.indicator} aria-hidden="true">
                  <Check size={14} strokeWidth={2} />
                </span>
              </label>
            );
          })}
        </div>
        {isPublic && selected && (
          <p role="status" className={styles.selection}>
            <Check
              size={16}
              aria-hidden="true"
              className="shrink-0 text-[var(--md-sys-color-primary)]"
            />
            <span>
              선택한 업종: <strong>{selected}</strong>
            </span>
          </p>
        )}
        <div className={styles.custom}>
          <p className={styles.sectionLabel}>목록에서 찾기 어렵나요?</p>
          <label className={`${styles.choice} ${styles.customChoice}`}>
            <input
              type="radio"
              name={`${id}-industry`}
              checked={custom}
              onChange={selectCustom}
              onClick={() => {
                if (custom) customNameInput.current?.focus();
              }}
              onKeyUp={(event) => {
                if (custom && (event.key === " " || event.key === "Enter"))
                  customNameInput.current?.focus();
              }}
              className="sr-only"
            />
            <span className={styles.choiceText}>업종을 직접 입력할게요</span>
            <span className={styles.indicator} aria-hidden="true">
              <Check size={14} strokeWidth={2} />
            </span>
          </label>
          {custom && (
            <div className={styles.customInput}>
              <label htmlFor={`${id}-name`} className="md-label-large">
                업종 이름
              </label>
              <Input
                className={isPublic ? publicInputClass : undefined}
                ref={customNameInput}
                id={`${id}-name`}
                placeholder="예: 반려동물 방문 돌봄"
                maxLength={100}
                value={draft.customIndustryName}
                aria-invalid={error || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => {
                  draft.setField("industryMode", "custom");
                  draft.setField("customIndustryName", event.target.value);
                }}
              />
            </div>
          )}
        </div>
      </fieldset>
      {error && (
        <div id={`${id}-error`}>
          <FieldError
            error={
              custom
                ? "업종 이름을 1~100자로 입력해주세요"
                : "업종을 선택하면 다음 질문으로 넘어갈 수 있어요"
            }
          />
        </div>
      )}
    </div>
  );
}
