<script lang="ts">
  const loose: any = 1;
  const MANY = 2;
  const label = MANY > 1 ? "many" : "one";
</script>

<p>{MANY > 1 ? "a" : "b"} {label}</p>

<style>
  p {
    color: red !important;
  }
</style>
