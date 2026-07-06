# 몬스터 로스터 + 상성 + 지휘관 데이터 기획서

- 작성일: 2026-07-06
- 상태: 초안 (설계 확정 — 숫자 튜닝 가능)
- 선행: [지휘관 스킬](../plans/2026-07-06-commander-skills.md) 완료

---

## 1. 목표
임시 데이터를 걷어내고 **데이터 기반 콘텐츠 토대**를 만든다: (1) 진영+역할 상성 시스템, (2) 제대로 된 몬스터 로스터, (3) 데이터화된 지휘관(2~3명, 서로 다른 스킬셋).

## 2. 확정 규칙

### 2.1 상성 (유닛 vs 유닛 전투에만 적용, 유리 시 ×1.3)
- **진영 오각형**(각자 다음을 이김):
  `mushroom → rock → toy → snow → fairy → mushroom`
  공격자 진영이 방어자 진영을 이기면 데미지 ×1.3.
- **역할 삼각**(각자 다음을 이김):
  `tank → ranged → melee → tank` (support는 상성 없음/중립)
  공격자 역할이 방어자 역할을 이기면 데미지 ×1.3.
- **누적**: 둘 다 유리하면 ×1.3×1.3 ≈ ×1.69. 최종 데미지는 반올림.
- 적용 범위: **유닛이 유닛을 때릴 때만**. 히어로 직접타격(빈 레인)·스킬 데미지에는 상성 미적용(v1).

### 2.2 몬스터 로스터
- 각 몬스터: `{ id, name, faction, role, rarity, maxHp, attack }` (기존 `UnitDef` 확장: `rarity` 추가; `attackInterval`은 유지하되 미사용).
- 진영 5종 × 역할(tank/melee/ranged/support) 조합으로 **진영당 3~4종**, 총 ~16~20종.
- 등급: `common | rare | epic | legendary` (스탯 스케일 차등).
- 이름은 전부 오리지널.

### 2.3 지휘관 데이터화
- 스킬을 **효과 데이터**로 표현:
  - `laneDamage(amount)` — 지정 레인 적 전체에 amount 피해 (타게팅 필요)
  - `teamAtkBonus(amount)` — 내 팀 공격력 +amount (누적)
  - `heroDamage(amount)` — 상대 히어로에 amount 피해
  - `healHero(amount)` — 내 히어로 HP +amount (최대 초과 불가)
- `SkillDef = { name, unlockTurn, effect, needsTarget }`
- `CommanderDef = { id, name, skills: [SkillDef, SkillDef, SkillDef] }`
- **지휘관 3명**(예시, 숫자 튜닝 가능):
  1. 아그니(공격형): 집중포화(laneDamage 20 @2) → 진군나팔(teamAtkBonus 6 @4) → 최후의일격(heroDamage 45 @6)
  2. 가이아(수호형): 재생(healHero 40 @2) → 전열강화(teamAtkBonus 8 @5) → 대지분쇄(laneDamage 26 @7)
  3. 프리마(폭발형): 서리파편(laneDamage 15 @2) → 서리파편(laneDamage 15 @4) → 절대영도(heroDamage 55 @7)
- v1: 플레이어=아그니, 상대=가이아 고정(지휘관 선택 UI는 이후). 결단은 지휘관 무관 공통 유지.

## 3. 범위

### 3.1 포함 ✅
- 상성 테이블 + `typeMultiplier` + `resolveCombat` 반영(엔진, TDD).
- 몬스터 로스터 데이터(진영당 3~4종) + 덱 구성.
- 지휘관 데이터 구조 + 3명 정의 + `createBattle`가 지휘관 받기 + `applySkill`이 효과 데이터 해석 + `nextSkillIndex`가 지휘관별 해금턴 사용(엔진, TDD).
- UI: 스킬 버튼이 지휘관 데이터의 이름/해금턴을 읽음; (선택) 유닛에 진영 표시.

### 3.2 제외 ❌ (이후)
- 지휘관 선택 UI, 덱 편집, 등급별 뽑기, 상성 시각 이펙트, 스킬 상성.

## 4. 기술
- `UnitDef`에 `rarity` 추가(선택 필드 or 필수—로스터 전부 지정). 엔진 순수·결정론 유지.
- 상성은 순수 함수(테이블 lookup). `resolveCombat` 데미지에 배수 적용 후 `Math.round`.
- 지휘관 스킬은 하드코딩 제거 → 데이터 해석. 기존 스킬 동작(3효과)은 아그니로 보존.
- 동일진영·동일역할 전투는 배수 1 → **기존 엔진 테스트 무변경 통과**.

## 5. 성공 기준
- 유리 상성으로 때리면 데미지가 눈에 띄게 큼(×1.3~).
- 지휘관마다 스킬셋이 다르게 작동(아그니/가이아 상대전).
- 로스터에서 덱이 구성되고 전투가 정상.
- 같은 시드+액션이면 결정론 유지.

## 6. 미해결 (이후)
- 밸런스 수치 튜닝, 지휘관/덱 선택 UI, 등급 획득 시스템, 상성 UI 표시 강화.
