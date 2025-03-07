import { 
  UPDATE_KINGDOM, 
  UPDATE_SELECTION, 
  CLEAR_SELECTION } from "./mutation-types";
import {
  RANDOMIZE,
  RANDOMIZE_FULL_KINGDOM,
  UNSELECT_CARD,
  SELECT_CARD,
  RandomizeSupplyCardParams,
} from "./action-types";

import { EventTracker } from "../../analytics/event-tracker";
import { EventType } from "../../analytics/event-tracker";
import { State } from "./randomizer-store";
import { ActionContext } from "vuex";
import { CardType } from "../../dominion/card-type";
import { RandomizerOptionsBuilder } from "../../randomizer/randomizer-options";
import { Cards } from "../../utils/cards";
import { Randomizer } from "../../randomizer/randomizer";
import { Kingdom } from "../../randomizer/kingdom";
import { Card } from "../../dominion/card";
import { Supply } from "../../randomizer/supply";
import { DominionSets } from "../../dominion/dominion-sets";
import { SupplyCard } from "../../dominion/supply-card";
import { SelectionParams } from "./selection";
import { Addon } from "../../dominion/addon";
import { SetId } from "../../dominion/set-id";
import { CostType } from "../../dominion/cost-type";
import { Boon } from "../../dominion/boon";
import { Ally } from "../../dominion/ally";

type Context = ActionContext<State, any>

export const actions = {
  LOAD_INITIAL_KINGDOM(context: Context, initialKingdom: Kingdom | null) {
    if (initialKingdom) {
      // Use the kingdom as-is if it contains 10 supply cards.
      if (initialKingdom.supply.supplyCards.length == 10) {
        EventTracker.trackEvent(EventType.LOAD_FULL_KINGDOM_FROM_URL);
        context.commit(UPDATE_KINGDOM, initialKingdom);
        return;
      }
      // Randomize the rest of the set if there are less than 10 cards.
      const options =
          createRandomizerOptionsBuilder(context)
              .setSetIds(getSelectedSetIds(context))
              .setExcludeTypes(getExcludeTypes(context))
              .setIncludeCardIds(Cards.extractIds(initialKingdom.supply.supplyCards))
              .build();
        
      const supply = Randomizer.createSupplySafe(options);
      if (supply) {
        EventTracker.trackEvent(EventType.LOAD_PARTIAL_KINGDOM_FROM_URL);
        let kingdom
        if ( initialKingdom.events.length + initialKingdom.landmarks.length +
            initialKingdom.projects.length + initialKingdom.ways.length +
            initialKingdom.traits.length == 0) {
            const Tempkingdom = Randomizer.createKingdom(options);
            let addonslength=0
            const regeneratedEvents = initialKingdom.events.concat(Tempkingdom.events).slice(0, 2);
            addonslength += regeneratedEvents.length
            const regeneratedLandmarks = initialKingdom.landmarks.concat(Tempkingdom.landmarks).slice(0, Math.max(0, 2 - addonslength));
            addonslength += regeneratedLandmarks.length
            const regeneratedProjects = initialKingdom.projects.concat(Tempkingdom.projects).slice(0, Math.max(0, 2 - addonslength));
            addonslength += regeneratedProjects.length
            const regeneratedWays = initialKingdom.ways.concat(Tempkingdom.ways).slice(0, Math.max(0, 2 - addonslength));
            addonslength += regeneratedWays.length
            const regeneratedTraits = initialKingdom.traits.concat(Tempkingdom.traits).slice(0, Math.max(0, 2 - addonslength));
            addonslength += regeneratedTraits.length
            kingdom = new Kingdom(
                Date.now(), supply, regeneratedEvents, regeneratedLandmarks,
                regeneratedProjects, regeneratedWays, initialKingdom.boons,
                initialKingdom.ally, regeneratedTraits, initialKingdom.metadata);
        } else {
            kingdom = new Kingdom(
                Date.now(), supply, initialKingdom.events, initialKingdom.landmarks,
                initialKingdom.projects, initialKingdom.ways, initialKingdom.boons,
                initialKingdom.ally, initialKingdom.traits, initialKingdom.metadata);
        }
        context.commit(CLEAR_SELECTION);
        context.commit(UPDATE_KINGDOM, kingdom);
        return;
      } else {
        EventTracker.trackError(EventType.LOAD_PARTIAL_KINGDOM_FROM_URL);
      }
    }

    // Do a full randomize since we failed to retrieve a kingdom from the URL.
    context.dispatch(RANDOMIZE);
  },

  RANDOMIZE(context: Context) {
    if (context.state.selection.isEmpty()) {
      context.dispatch(RANDOMIZE_FULL_KINGDOM);
      return;
    }
    const selectedCards = getSelectedSupplyCards(context);    
    const oldSupply = context.state.kingdom.supply;
    const newSupply = selectedCards.length 
        ? randomizeSelectedCards(context) || oldSupply
        : oldSupply;

    const isAddonSelected = 
        getSelectedEvents(context).length ||
        getSelectedLandmarks(context).length ||
        getSelectedProjects(context).length ||
        getSelectedWays(context).length ||
        getSelectedTraits(context).length;
    const newAddons = isAddonSelected ? randomizeSelectedAddons(context) : null;
    const newEvents = newAddons
        ? Cards.getAllEvents(newAddons).concat(getUnselectedEvents(context))
        : context.state.kingdom.events;
    const newLandmarks = newAddons
        ? Cards.getAllLandmarks(newAddons).concat(getUnselectedLandmarks(context))
        : context.state.kingdom.landmarks;
    const newProjects = newAddons
        ? Cards.getAllProjects(newAddons).concat(getUnselectedProjects(context))
        : context.state.kingdom.projects;
    const newWays = newAddons
        ? Cards.getAllWays(newAddons).concat(getUnselectedWays(context))
        : context.state.kingdom.ways;
    const newAlly = randomizeSelectedAlly(context, newSupply);
    const newBoons = randomizeSelectedBoons(context, newSupply);
    const newTraits = newAddons
        ? Cards.getAllTraits(newAddons).concat(getUnselectedTraits(context))
        : context.state.kingdom.traits;
        
    const kingdom = new Kingdom(
      context.state.kingdom.id, newSupply, newEvents, newLandmarks, newProjects,
      newWays, newBoons, newAlly, newTraits, context.state.kingdom.metadata);
    context.commit(CLEAR_SELECTION);
    context.commit(UPDATE_KINGDOM, kingdom);
  },

  RANDOMIZE_FULL_KINGDOM(context: Context) {
    const setIds = getSelectedSetIds(context);
    if (!setIds.length) {
      /* possibility : randomize sets to generate new kigdoms */
      return;
    }

    const options = createRandomizerOptionsBuilder(context)
      .setSetIds(setIds)
      .setExcludeCardIds(getCardsToExclude(context))
      .setExcludeTypes(getExcludeTypes(context))
      .build();

    try {
      const kingdom = Randomizer.createKingdom(options);
      context.commit(CLEAR_SELECTION);
      context.commit(UPDATE_KINGDOM, kingdom);
      EventTracker.trackEvent(EventType.RANDOMIZE_KINGDOM);
    } catch (e) {
      EventTracker.trackError(EventType.RANDOMIZE_KINGDOM);
    }
  },

  RANDOMIZE_SUPPLY_CARD(context: Context, params: RandomizeSupplyCardParams) {
    const randomizerSettings = context.state.settings.randomizerSettings;
    const excludeTypes: CardType[] = [];
    if (params.selectedCardType && !randomizerSettings.allowAttacks) {
      excludeTypes.push(CardType.ATTACK);
    }
    const setIds: SetId[] = params.selectedSetId == null
        ? getSelectedSetIds(context)
        : [params.selectedSetId!];

    const excludeCosts: CostType[] = [];
    for (const key in CostType) {
      if (params.selectedCostTypes.indexOf((CostType as any)[key]) == -1) {
        excludeCosts.push((CostType as any)[key] as CostType);
      }
    }

    const optionsBuilder = new RandomizerOptionsBuilder()
      .setSetIds(setIds)
      .setIncludeCardIds(Cards.extractIds(getUnselectedSupplyCards(context)))
      .setExcludeCardIds(Cards.extractIds(getSelectedSupplyCards(context)))
      .setExcludeTypes(excludeTypes)
      .setExcludeCosts(excludeCosts)
      .setUseAlchemyRecommendation(randomizerSettings.isAlchemyRecommendationEnabled)
      .setBaneCardId(context.state.kingdom.supply.baneCard
        ? context.state.kingdom.supply.baneCard.id
        : null);

    // Either set a specific card type or add supply card requirements if one isn't selected.
    if (params.selectedCardType) {
      optionsBuilder.setRequireSingleCardOfType(params.selectedCardType);
    } else {
      optionsBuilder
        .setRequireActionProvider(randomizerSettings.requireActionProvider)
        .setRequireCardProvider(randomizerSettings.requireCardProvider)
        .setRequireBuyProvider(randomizerSettings.requireBuyProvider)
        .setRequireTrashing(randomizerSettings.requireTrashing)
        .setRequireReactionIfAttacks(randomizerSettings.requireReaction)
    }

    const supply = Randomizer.createSupplySafe(optionsBuilder.build());
    if (supply) {
      const oldKingdom = context.state.kingdom;
      const kingdom = new Kingdom(
        oldKingdom.id, supply, oldKingdom.events, oldKingdom.landmarks, oldKingdom.projects,
        oldKingdom.ways, randomizeSelectedBoons(context, supply), 
        randomizeSelectedAlly(context, supply), oldKingdom.traits, oldKingdom.metadata);
      context.commit(CLEAR_SELECTION);
      context.commit(UPDATE_KINGDOM, kingdom);
      EventTracker.trackEvent(EventType.RANDOMIZE_SINGLE);
    } else {
      EventTracker.trackError(EventType.RANDOMIZE_SINGLE);
    }
  },

  RANDOMIZE_UNDEFINED_ADDON(context: Context) {
    const addons = randomizeUndefinedAddon(context).concat(getAddons(context));        
    const kingdom = new Kingdom(
      context.state.kingdom.id,
      context.state.kingdom.supply,
      Cards.getAllEvents(addons),
      Cards.getAllLandmarks(addons),
      Cards.getAllProjects(addons),
      Cards.getAllWays(addons),
      context.state.kingdom.boons,
      context.state.kingdom.ally,
      Cards.getAllTraits(addons),
      context.state.kingdom.metadata);
    context.commit(UPDATE_KINGDOM, kingdom);
  },

  TOGGLE_CARD_SELECTION(context: Context, id: string) {
    const action = context.state.selection.contains(id) ? UNSELECT_CARD : SELECT_CARD;
    context.dispatch(action, id);
  },

  SELECT_CARD(context: Context, id: string) {
    if (context.state.selection.contains(id)) {
      return;
    }
    const selection = context.state.selection;
    const card = DominionSets.getCardById(id);
    if (card instanceof SupplyCard) {
      context.commit(UPDATE_SELECTION, {
        selectedSupplyIds: selection.selectedSupplyIds.concat([id])
      } as SelectionParams);
    } else if (card instanceof Boon) {
      context.commit(UPDATE_SELECTION, {
        selectedBoonIds: selection.selectedBoonIds.concat([id])
      } as SelectionParams);
    } else if (card instanceof Ally) {
      context.commit(UPDATE_SELECTION, { selectedAllyId: id });
    } else {
      context.commit(UPDATE_SELECTION, {
        selectedAddonIds: selection.selectedAddonIds.concat([id]) 
      } as SelectionParams);
    }
  },

  UNSELECT_CARD(context: Context, id: string) {
    if (!context.state.selection.contains(id)) {
      return;
    }
    const selection = context.state.selection;
    const card = DominionSets.getCardById(id);
    const filterFn = (existingId: string) => existingId != id;
    if (card instanceof SupplyCard) {
      context.commit(UPDATE_SELECTION, {
        selectedSupplyIds: selection.selectedSupplyIds.filter(filterFn)
      } as SelectionParams);
    } else if (card instanceof Boon) {
      context.commit(UPDATE_SELECTION, {
        selectedBoonIds: selection.selectedBoonIds.filter(filterFn)
      } as SelectionParams);
    } else if (card instanceof Ally) {
      context.commit(UPDATE_SELECTION, { selectedAllyId: null });
    } else {
      context.commit(UPDATE_SELECTION, {
        selectedAddonIds: selection.selectedAddonIds.filter(filterFn)
      } as SelectionParams);
    }
  }
}

function randomizeSelectedCards(context: Context): Supply | null {
  const excludeCardIds = getSelectedSupplyCards(context).map((card) => card.id);
  const isBaneSelected = isBaneCardSelected(context);
  if (isBaneSelected) {
    excludeCardIds.push(context.state.kingdom.supply.baneCard?.id ?? "");
  }

  const optionsBuilder = createRandomizerOptionsBuilder(context)
      .setSetIds(getSelectedSetIds(context))
      .setIncludeCardIds(getUnselectedSupplyCards(context).map((card) => card.id))
      .setExcludeCardIds(excludeCardIds)
      .setExcludeTypes(getExcludeTypes(context))

  if (!isBaneSelected && context.state.kingdom.supply.baneCard) {
    optionsBuilder.setBaneCardId(context.state.kingdom.supply.baneCard?.id ?? false)
  }
  const supply = Randomizer.createSupplySafe(optionsBuilder.build());
  if (supply) {
    EventTracker.trackEvent(EventType.RANDOMIZE_MULTIPLE);
  } else {
    EventTracker.trackError(EventType.RANDOMIZE_MULTIPLE);
  }
  return supply;
}

function randomizeSelectedAddons(context: Context) {
  const newAddonsCount = getSelectedEvents(context).length
      + getSelectedLandmarks(context).length
      + getSelectedProjects(context).length
      + getSelectedWays(context).length
      + getSelectedTraits(context).length;
  const addonIds = getAddons(context).map((addon) => addon.id);
  EventTracker.trackEvent(EventType.RANDOMIZE_EVENTS_AND_LANDMARKS);
  return Randomizer.getRandomAddons(getSelectedSetIds(context), addonIds, newAddonsCount);
}

function randomizeUndefinedAddon(context: Context) {
  const addonIds = getAddons(context).map((addon) => addon.id);
  EventTracker.trackEvent(EventType.RANDOMIZE_EVENTS_AND_LANDMARKS);
  return Randomizer.getRandomAddons(getSelectedSetIds(context), addonIds, 1);
}

function randomizeSelectedBoons(context: Context, supply: Supply) {
  if (getSelectedBoons(context).length) {
    EventTracker.trackEvent(EventType.RANDOMIZE_BOONS);
  }
  return Randomizer.getRandomBoons(supply, getUnselectedBoons(context));
}

function randomizeSelectedAlly(context: Context, supply: Supply) {
  if (supply.supplyCards.every((s) => !s.isLiaison)) {
      return null;
  }
  const selectedAlly = getSelectedAlly(context);
  if (!selectedAlly.length) {
    const unselectedAlly = getUnselectedAlly(context);
    if (unselectedAlly !== null) return unselectedAlly
    return Randomizer.getRandomAlly(supply)
  }
  EventTracker.trackEvent(EventType.RANDOMIZE_ALLY);
  return Randomizer.getRandomAlly(supply, selectedAlly[0].id);
}

function createRandomizerOptionsBuilder(context: Context) {
  const randomizerSettings = context.state.settings.randomizerSettings;
  return new RandomizerOptionsBuilder()
      .setRequireActionProvider(randomizerSettings.requireActionProvider)
      .setRequireBuyProvider(randomizerSettings.requireBuyProvider)
      .setRequireTrashing(randomizerSettings.requireTrashing)
      .setRequireReactionIfAttacks(randomizerSettings.requireReaction)
      .setUseAlchemyRecommendation(randomizerSettings.isAlchemyRecommendationEnabled)
      .setDistributeCost(
          context.getters.isDistributeCostAllowed && randomizerSettings.distributeCost)
      .setPrioritizeSet(
          context.getters.isPrioritizeSetAllowed
              ? randomizerSettings.prioritizeSet
              : null);
}

function getCardsToExclude(context: Context) {
  // Only exclude cards when at least 3 sets are selected and no sets are prioritized.
  if (context.state.settings.randomizerSettings.prioritizeSet) {
    return [];
  } 
  const setIds = getSelectedSetIds(context);
  return setIds.length >= 3
      ? getSelectedSupplyCards(context).map((card) => card.id)
      : [];
}

function getAddons(context: Context) {
  const kingdom = context.state.kingdom;
  return (kingdom.events as Addon[])
      .concat(
        kingdom.landmarks as Addon[], 
        kingdom.projects as Addon[],
        kingdom.ways as Addon[],
        kingdom.traits as Addon[],
      );
}

function getSelectedSetIds(context: Context) {
  return context.state.settings.selectedSets;
}

function getExcludeTypes(context: Context): CardType[] {
  return context.state.settings.randomizerSettings.allowAttacks ? [] : [CardType.ATTACK];
}

function getSelectedSupplyCards(context: Context) {
  return getSelected(context, context.state.kingdom.supply.getSupplyCardsWithBane());
}

function getUnselectedSupplyCards(context: Context) {
  const selection = context.state.selection;
  const cards = context.state.kingdom.supply.supplyCards;
  return cards.filter((card) => !selection.contains(card.id));
}

function getSelectedEvents(context: Context) {
  return getSelected(context, context.state.kingdom.events);
}

function getSelectedLandmarks(context: Context) {
  return getSelected(context, context.state.kingdom.landmarks);
}

function getSelectedProjects(context: Context) {
  return getSelected(context, context.state.kingdom.projects);
}

function getSelectedWays(context: Context) {
  return getSelected(context, context.state.kingdom.ways);
}

function getSelectedBoons(context: Context) {
  return getSelected(context, context.state.kingdom.boons);
}

function getSelectedTraits(context: Context) {
  return getSelected(context, context.state.kingdom.traits);
}

function getSelectedAlly(context: Context) {
  return getSelected(context, context.state.kingdom.ally ? [context.state.kingdom.ally] : []);
}

function getSelected<T extends Card>(context: Context, cards: T[]) {
  const selection = context.state.selection;
  return cards.filter((card) => selection.contains(card.id));
}

function getUnselectedEvents(context: Context) {
  return getUnselected(context, context.state.kingdom.events);
}

function getUnselectedLandmarks(context: Context) {
  return getUnselected(context, context.state.kingdom.landmarks);
}

function getUnselectedProjects(context: Context) {
  return getUnselected(context, context.state.kingdom.projects);
}

function getUnselectedWays(context: Context) {
  return getUnselected(context, context.state.kingdom.ways);
}

function getUnselectedTraits(context: Context) {
  return getUnselected(context, context.state.kingdom.traits);
}

function getUnselectedAlly(context: Context) {
  const unselected = getUnselected(context, context.state.kingdom.ally ? [context.state.kingdom.ally] : []);
  return unselected.length ? unselected[0] : null;
}

function getUnselectedBoons(context: Context) {
  return getUnselected(context, context.state.kingdom.boons);
}

function getUnselected<T extends Card>(context: Context, cards: T[]) {
  const selection = context.state.selection;
  return cards.filter((card) => !selection.contains(card.id));
}

function isBaneCardSelected(context: Context) {
  const selection = context.state.selection;
  const baneCard = context.state.kingdom.supply.baneCard;
  return Boolean(baneCard && selection.contains(baneCard.id));
}
