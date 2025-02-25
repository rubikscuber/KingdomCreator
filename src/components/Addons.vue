<template>
  <div class="addons" v-if="hasAddons">
    <div class="addons-header">
      <AddonTitle
        :has-events="canHaveEvents"
        :has-landmarks="canHaveLandmarks"
        :has-projects="canHaveProjects"
        :has-ways="canHaveWays"
        :has-traits="canHaveTraits"
      />
    </div>
    <GridLayout
        :class="{'addon--is-enlarged': isEnlarged}"
        :items="activeContainers"
        :number-of-columns="numberOfColumns"
        :is-vertical="false"
      >
      <template v-slot:default="slotProps">
        <FlippingCard
          :on-card-back-click="function() { handleClick(slotProps.item) }"
          :card="slotProps.item.addon"
          :is-vertical="false"
        />
      </template>
    </GridLayout>
  </div>
</template>

<script lang="ts">
import AddonTitle from "./AddonTitle.vue";
import GridLayout from "./GridLayout.vue";
import FlippingCard from "./FlippingCard.vue";
import { Addon } from "../dominion/addon";
import { Vue, Component, Watch } from "vue-property-decorator";
import { Getter, State } from "vuex-class";
import { RANDOMIZE_UNDEFINED_ADDON } from "../stores/randomizer/action-types";

interface AddonContainer {
  addon: Addon | null,
}

const NUMBER_OF_ADDONS = 2;

@Component({
  components: {
    AddonTitle,
    GridLayout,
    FlippingCard
  }
})
export default class Addons extends Vue {
  @State(state => state.randomizer.selection) readonly selection!: Selection;
  @State(state => state.window.isEnlarged) readonly isEnlarged!: boolean;
  @State(state => state.window.width) readonly windowWidth!: number;
  @Getter("hasAddons") readonly hasAddons!: boolean;
  @Getter("canHaveEvents") readonly canHaveEvents!: string;
  @Getter("canHaveLandmarks") readonly canHaveLandmarks!: string;
  @Getter("canHaveProjects") readonly canHaveProjects!: string;
  @Getter("canHaveWays") readonly canHaveWays!: string;
  @Getter("canHaveTraits") readonly canHaveTraits!: string;
  @Getter("addons") readonly addons!: Addon[];
  activeContainers: AddonContainer[] = Addons.fillWithEmptyAddonContainers([]);

  get numberOfColumns() {
    return this.isEnlarged ? 1 : this.windowWidth > 525 ? 3 : 2;
  }

  mounted() {
    this.updateAddonContainers();
  }
  
  @Watch("addons")
  handleAddonsChanged() {
    this.updateAddonContainers();
  }
  
  handleClick(addonContainer: AddonContainer) {
    if (!addonContainer.addon) {
      this.$store.dispatch(RANDOMIZE_UNDEFINED_ADDON);
    }
  }

  private updateAddonContainers() {
    if (!this.addons.length) {
      this.activeContainers = Addons.fillWithEmptyAddonContainers([]);
      return;
    }
    const newAddons = Addons.findNewAddons(this.activeContainers, this.addons);
    let newAddonsIndex = 0;
    const newContainers = [];
    for (let i = 0; i < this.activeContainers.length; i++) {
      const container = this.activeContainers[i];
      if (container.addon != null 
          && Addons.containsAddon(this.addons, container.addon)) {
        newContainers.push(container);
      } else {
        newContainers.push({
          addon: newAddons.length > newAddonsIndex ? newAddons[newAddonsIndex++] : null
        });
      }
    }
    this.activeContainers = Addons.fillWithEmptyAddonContainers(newContainers);
  }

  private static findNewAddons(containers: AddonContainer[], addons: Addon[]) {
    let existingIds = containers
        .filter(container => container.addon != null)
        .map(container => container.addon!.id);
    let newAddons: Addon[] = [];
    for (let addon of addons) {
      if (existingIds.indexOf(addon.id) == -1) {
        newAddons.push(addon);
      }
    }
    return newAddons;
  }

  private static containsAddon(list: Addon[], addon: Addon) {
    return list.some((listAddon) => listAddon.id == addon.id);
  }

  private static fillWithEmptyAddonContainers(list: AddonContainer[]) {
    for (let i = list.length; i < NUMBER_OF_ADDONS; i++) {
      list.push({addon: null});
    }
    return list;
  }
}
</script>

<style>

/* .addons .flip-card__content__back {
  cursor: pointer;
} */

.addon--is-enlarged .card-description {
  font-size: 18px !important;
}
</style>