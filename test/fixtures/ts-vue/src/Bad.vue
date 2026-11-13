<template>
  <div>
    <p>{{ count > 1 ? "a" : "b" }}</p>
    <my-child :label="count > 1 ? 'x' : 'y'" />
    <span v-html="raw"></span>
  </div>
</template>

<script setup lang="ts">
const loose: any = 1;
const count = 2;
const raw = "<b>x</b>";
</script>

<style scoped>
p {
  color: red !important;
}
</style>
